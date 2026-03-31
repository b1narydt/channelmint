import { createApp } from './app.js'
import { createDatabase } from './db/connection.js'
import { loadConfig } from './config/index.js'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)
const app = createApp(db)

app.listen(config.port, () => {
  console.log(`ChannelMint API listening on port ${config.port}`)
})
