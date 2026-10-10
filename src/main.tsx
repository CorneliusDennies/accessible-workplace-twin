import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PlannerApp } from './planner/PlannerApp.tsx'
import { ChatApp } from './chat/ChatApp.tsx'

// ?planner keeps the original planner view reachable.
const showPlanner = new URLSearchParams(window.location.search).has('planner')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showPlanner ? <PlannerApp /> : <ChatApp />}
  </StrictMode>,
)
