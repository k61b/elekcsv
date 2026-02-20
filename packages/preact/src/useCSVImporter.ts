import {
  type BitmapValidationResult,
  type ValidationError,
  type ValidationResult,
  applyMapping,
  mapColumns,
  parse,
  validate,
  validateBitmap,
} from '@elekcsv/core'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'preact/hooks'

import {
  canGoBack as checkCanGoBack,
  canGoForward as checkCanGoForward,
  createInitialState,
  importerReducer,
} from './state-machine'
import type {
  ImportResult,
  ImportStats,
  ImporterStep,
  UseCSVImporterOptions,
  UseCSVImporterReturn,
} from './types'

const BITMAP_THRESHOLD = 10_000

function buildImportResult(
  state: import('./types').ImporterState,
  schema: import('@elekcsv/core').Schema,
): ImportResult | null {
  if (!state.mappedData || !state.mapping) return null
  const validation = state.validation ?? state.bitmapValidation
  if (!validation) return null

  const schemaColumns = Object.keys(schema.columns)
  const errorCount = state.bitmapValidation
    ? state.bitmapValidation.errorCount
    : (state.validation?.errors.length ?? 0)
  const errorRowCount = state.bitmapValidation
    ? state.bitmapValidation.getErrorRowCount()
    : new Set(state.validation?.errors.map((e) => e.row)).size

  const stats: ImportStats = {
    totalRows: state.rowCount,
    validRows: state.rowCount - errorRowCount,
    invalidRows: errorRowCount,
    errorCount,
    parseTime: state.parseTime ?? 0,
    validationTime: state.validationTime ?? 0,
  }

  return {
    data: state.mappedData,
    headers: schemaColumns,
    mapping: state.mapping,
    validation,
    stats,
  }
}

function shouldAutoMap(
  result: ReturnType<typeof mapColumns>,
  threshold: number,
): boolean {
  if (result.unmappedSchemaColumns.length > 0) return false
  for (const mapping of result.mappings) {
    if (mapping.schemaColumn === '') continue
    if (mapping.confidence === 'exact' || mapping.confidence === 'alias')
      continue
    if (mapping.confidence === 'fuzzy' && mapping.score >= threshold) continue
    return false
  }
  return true
}

export function useCSVImporter(
  options: UseCSVImporterOptions,
): UseCSVImporterReturn {
  const {
    schema,
    autoMap = true,
    autoMapThreshold = 0.8,
    maxPreviewRows = 10,
    maxRows,
    locale,
    onComplete,
    onError,
    onStepChange,
    delimiter,
    quote,
  } = options

  const [state, dispatch] = useReducer(
    importerReducer,
    undefined,
    createInitialState,
  )
  const prevStepRef = useRef<ImporterStep>(state.step)
  const pendingContentRef = useRef<string | null>(null)

  useEffect(() => {
    if (prevStepRef.current !== state.step) {
      prevStepRef.current = state.step
      onStepChange?.(state.step)
    }
  }, [state.step, onStepChange])

  useEffect(() => {
    if (state.step === 'error' && state.error) {
      onError?.(state.error)
    }
  }, [state.step, state.error, onError])

  const runValidation = useCallback(
    (data: string[][]) => {
      try {
        const startTime = performance.now()
        const useBitmap = data.length > BITMAP_THRESHOLD
        const result: ValidationResult | BitmapValidationResult = useBitmap
          ? validateBitmap(data, schema)
          : validate(data, schema)
        const validationTime = performance.now() - startTime
        dispatch({
          type: 'VALIDATE_COMPLETE',
          result,
          time: validationTime,
          isBitmap: useBitmap,
        })
      } catch (err) {
        dispatch({
          type: 'VALIDATE_ERROR',
          error: err instanceof Error ? err.message : 'Validation failed',
        })
      }
    },
    [schema],
  )

  const processContent = useCallback(
    (content: string) => {
      try {
        const startTime = performance.now()
        const parseResult = parse(content, { delimiter, quote, header: true })
        const parseTime = performance.now() - startTime
        const headers = parseResult.headers ?? []
        let data = parseResult.rows
        if (maxRows && data.length > maxRows) data = data.slice(0, maxRows)

        dispatch({ type: 'PARSE_COMPLETE', data, headers, time: parseTime })

        const mappingResult = mapColumns(headers, schema, {
          fuzzyThreshold: 0.6,
          autoAcceptThreshold: autoMapThreshold,
        })
        dispatch({ type: 'SET_MAPPING', mapping: mappingResult })

        if (autoMap && shouldAutoMap(mappingResult, autoMapThreshold)) {
          const mappedData = applyMapping(
            data,
            mappingResult.mappings,
            schema,
            {
              hasHeader: false,
            },
          )
          dispatch({ type: 'SKIP_MAPPING', mapping: mappingResult, mappedData })
          runValidation(mappedData)
        }
      } catch (err) {
        dispatch({
          type: 'PARSE_ERROR',
          error: err instanceof Error ? err.message : 'Unknown parse error',
        })
      }
    },
    [
      schema,
      delimiter,
      quote,
      maxRows,
      autoMap,
      autoMapThreshold,
      runValidation,
    ],
  )

  const loadFile = useCallback(
    (file: File) => {
      dispatch({ type: 'LOAD_FILE', file })
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = (e.target as FileReader).result as string
        if (content) processContent(content)
        else
          dispatch({
            type: 'PARSE_ERROR',
            error: 'Failed to read file content',
          })
      }
      reader.onerror = () =>
        dispatch({ type: 'PARSE_ERROR', error: 'Failed to read file' })
      reader.readAsText(file)
    },
    [processContent],
  )

  const loadString = useCallback((content: string, fileName?: string) => {
    dispatch({ type: 'LOAD_STRING', content, fileName })
    pendingContentRef.current = content
  }, [])

  useEffect(() => {
    if (state.step === 'parsing' && pendingContentRef.current) {
      const content = pendingContentRef.current
      pendingContentRef.current = null
      processContent(content)
    }
  }, [state.step, processContent])

  const updateMapping = useCallback(
    (csvIndex: number, schemaColumn: string | null) => {
      dispatch({ type: 'UPDATE_MAPPING', csvIndex, schemaColumn })
    },
    [],
  )

  const confirmMapping = useCallback(() => {
    if (!state.rawData || !state.mapping) return
    try {
      const mappedData = applyMapping(
        state.rawData,
        state.mapping.mappings,
        schema,
        {
          hasHeader: false,
        },
      )
      dispatch({ type: 'CONFIRM_MAPPING', mappedData })
      runValidation(mappedData)
    } catch (err) {
      dispatch({
        type: 'VALIDATE_ERROR',
        error: err instanceof Error ? err.message : 'Failed to apply mapping',
      })
    }
  }, [state.rawData, state.mapping, schema, runValidation])

  const accept = useCallback(() => {
    if (state.step === 'review') dispatch({ type: 'ACCEPT' })
  }, [state.step])

  const buildImportResultMemo = useCallback((): ImportResult | null => {
    if (!state.mappedData || !state.mapping) return null
    const validation = state.validation ?? state.bitmapValidation
    if (!validation) return null

    const schemaColumns = Object.keys(schema.columns)
    const errorCount = state.bitmapValidation
      ? state.bitmapValidation.errorCount
      : (state.validation?.errors.length ?? 0)
    const errorRowCount = state.bitmapValidation
      ? state.bitmapValidation.getErrorRowCount()
      : new Set(state.validation?.errors.map((e) => e.row)).size

    const stats: ImportStats = {
      totalRows: state.rowCount,
      validRows: state.rowCount - errorRowCount,
      invalidRows: errorRowCount,
      errorCount,
      parseTime: state.parseTime ?? 0,
      validationTime: state.validationTime ?? 0,
    }

    return {
      data: state.mappedData,
      headers: schemaColumns,
      mapping: state.mapping,
      validation,
      stats,
    }
  }, [state, schema])

  useEffect(() => {
    if (state.step === 'complete' && onComplete) {
      const result = buildImportResultMemo()
      if (result) onComplete(result)
    }
  }, [state.step, onComplete, buildImportResultMemo])

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  const goBack = useCallback(() => dispatch({ type: 'GO_BACK' }), [])

  const getErrors = useCallback(
    (options?: { limit?: number; offset?: number }): ValidationError[] => {
      if (state.bitmapValidation)
        return state.bitmapValidation.getErrors(options)
      if (state.validation) {
        const { limit = 100, offset = 0 } = options ?? {}
        return state.validation.errors.slice(offset, offset + limit)
      }
      return []
    },
    [state.validation, state.bitmapValidation],
  )

  const getRowErrors = useCallback(
    (row: number): ValidationError[] => {
      if (state.bitmapValidation)
        return state.bitmapValidation.getRowErrors(row)
      if (state.validation)
        return state.validation.errors.filter((e) => e.row === row)
      return []
    },
    [state.validation, state.bitmapValidation],
  )

  const getCellError = useCallback(
    (row: number, col: number): ValidationError | null => {
      if (state.bitmapValidation)
        return state.bitmapValidation.getCellError(row, col)
      if (state.validation)
        return (
          state.validation.errors.find((e) => e.row === row && e.col === col) ??
          null
        )
      return null
    },
    [state.validation, state.bitmapValidation],
  )

  const getErrorSummary = useCallback((): Record<string, number> => {
    if (state.bitmapValidation) return state.bitmapValidation.getErrorSummary()
    if (state.validation) return state.validation.stats.errorsByRule
    return {}
  }, [state.validation, state.bitmapValidation])

  const isLoading = state.step === 'parsing' || state.step === 'validating'
  const isComplete = state.step === 'complete'
  const hasErrors = useMemo(() => {
    if (state.bitmapValidation) return state.bitmapValidation.errorCount > 0
    if (state.validation) return state.validation.errors.length > 0
    return false
  }, [state.validation, state.bitmapValidation])
  const canGoBack = checkCanGoBack(state.step)
  const canGoForward = checkCanGoForward(state.step)

  return {
    state,
    step: state.step,
    isLoading,
    isComplete,
    hasErrors,
    canGoBack,
    canGoForward,
    loadFile,
    loadString,
    updateMapping,
    confirmMapping,
    accept,
    reset,
    goBack,
    getErrors,
    getRowErrors,
    getCellError,
    getErrorSummary,
  }
}
