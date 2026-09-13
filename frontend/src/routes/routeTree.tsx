import { rootRoute } from './root'
import { Route as indexRoute } from './index'

export const routeTree = rootRoute.addChildren([indexRoute])
