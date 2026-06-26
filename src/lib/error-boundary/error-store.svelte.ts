export interface AppError {
    id: string
    source: string
    message: string
    kind: 'error' | 'rejection'
    timestamp: number
}

class ErrorStore {
    items = $state<AppError[]>([])

    get latest(): AppError | null {
        return this.items[this.items.length - 1] ?? null
    }

    get count(): number {
        return this.items.length
    }

    record(source: string, message: string, kind: 'error' | 'rejection'): AppError {
        const error: AppError = {
            id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            source,
            message,
            kind,
            timestamp: Date.now()
        }
        this.items = [...this.items, error].slice(-50)
        return error
    }

    dismiss(id: string): void {
        this.items = this.items.filter((e) => e.id !== id)
    }

    clear(): void {
        this.items = []
    }
}

export const errorStore = new ErrorStore()
