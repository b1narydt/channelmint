export interface AppConfig {
  port: number
  databaseUrl: string
  nodeEnv: string
}

export function loadConfig (): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl: process.env.DATABASE_URL ?? 'sqlite://./channelmint.db',
    nodeEnv: process.env.NODE_ENV ?? 'development'
  }
}
