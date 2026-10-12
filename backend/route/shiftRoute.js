import express from 'express'
import {
  createShiftHandler,
  getShiftHistoryHandler,
  peerApproveShiftHandler,
  peerRejectShiftHandler,
} from '../handlers/shiftHandler.js'

const router = express.Router()

router.post('/shift', createShiftHandler)
router.get('/shift/:username', getShiftHistoryHandler)
router.patch('/shift/:id/peer-approve', peerApproveShiftHandler)
router.patch('/shift/:id/peer-reject', peerRejectShiftHandler)

export default router
