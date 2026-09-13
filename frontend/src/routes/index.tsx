import { createRoute } from '@tanstack/react-router'
import App from '../App'
import { rootRoute } from './root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <App />,
})
