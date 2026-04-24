import {ToolRouter} from './toolRouter'
import {createReadFileTool} from './builtin/readFileTool'

export function createDefaultToolRouter(): ToolRouter {
  const router = new ToolRouter()
  router.register(createReadFileTool())
  return router
}
