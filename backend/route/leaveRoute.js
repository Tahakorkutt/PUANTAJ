import express from 'express'
import { createLeaveHandler, getLeaveHistoryHandler } from '../handlers/leaveHandler.js'

const router = express.Router()

router.post('/leave', createLeaveHandler)
router.get('/leave/:username', getLeaveHistoryHandler)

export default router
