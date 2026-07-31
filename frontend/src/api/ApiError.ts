export class ApiError extends Error {
  status: number
  code: string
  detail?: string

  constructor(status: number, code: string, message: string, detail?: string) {
    super(message)

    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}
