import {ToolRouter} from './toolRouter'
import {createReadFileTool} from './builtin/readFileTool'
import {createEditFileTool} from './builtin/editFileTool'
import {createRunCommandTool} from './builtin/runCommandTool'
import {createWriteFileTool} from './builtin/writeFileTool'

export function createDefaultToolRouter(): ToolRouter {
  const router = new ToolRouter()
  router.register(createReadFileTool())
  router.register(createWriteFileTool())
  router.register(createEditFileTool())
  router.register(createRunCommandTool())
  return router
}
