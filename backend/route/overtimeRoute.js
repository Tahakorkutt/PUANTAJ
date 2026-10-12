import express from 'express'
import { createOvertimeHandler, getOvertimeHistoryHandler } from '../handlers/overtimeHandler.js'

const router = express.Router()

router.post('/overtime', createOvertimeHandler)
router.get('/overtime/:username', getOvertimeHistoryHandler)

export default router
