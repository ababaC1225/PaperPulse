export class SourceAdapter {
  constructor({ name, httpClient, logger }) {
    this.name = name
    this.httpClient = httpClient
    this.logger = logger.child({ source: name })
  }

  async search() {
    throw new Error(`${this.constructor.name}.search() must be implemented`)
  }

  async fetchDetails(candidate) {
    return candidate
  }
}
