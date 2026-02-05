import { MCPSessionManager } from '@google/adk';

export class CachedMCPSessionManager extends MCPSessionManager {
  #client = null;

  async createSession() {
    if (this.#client) return this.#client;
    this.#client = await super.createSession();
    return this.#client;
  }
}
