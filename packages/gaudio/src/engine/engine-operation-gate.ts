export interface EngineOperationGate<OperationValue = void> {
  readonly completion: Promise<OperationValue>
  resolve: (operationValue: OperationValue) => boolean
  reject: (error: unknown) => boolean
}

// AI modified: engine promises remain observed while lifecycle events can settle their public operation independently.
export function createEngineOperationGate<OperationValue = void>(): EngineOperationGate<OperationValue> {
  let hasSettled = false
  let resolveCompletion: (operationValue: OperationValue) => void = () => {}
  let rejectCompletion: (error: unknown) => void = () => {}
  const completion = new Promise<OperationValue>((resolve, reject) => {
    resolveCompletion = resolve
    rejectCompletion = reject
  })

  return {
    completion,
    resolve: (operationValue): boolean => {
      if (hasSettled) {
        return false
      }
      hasSettled = true
      resolveCompletion(operationValue)
      return true
    },
    reject: (error): boolean => {
      if (hasSettled) {
        return false
      }
      hasSettled = true
      rejectCompletion(error)
      return true
    },
  }
}

export function observeEngineOperation<OperationValue>(
  startOperation: () => Promise<OperationValue>,
  operationGate: EngineOperationGate<OperationValue>,
): void {
  let engineOperation: Promise<OperationValue>
  try {
    engineOperation = startOperation()
  }
  catch (error) {
    operationGate.reject(error)
    return
  }

  void Promise.resolve(engineOperation).then(
    operationValue => operationGate.resolve(operationValue),
    error => operationGate.reject(error),
  )
}
