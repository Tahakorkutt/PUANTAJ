import express from 'express'
import {
  createUserHandler,
  loginUserHandler,
  logoutUserHandler,
  getDepartmentColleaguesHandler,
} from '../handlers/userHandler.js'

const router = express.Router()

router.post('/register', createUserHandler)
router.post('/login', loginUserHandler)
router.post('/logout', logoutUserHandler)
router.get('/users/colleagues/:username', getDepartmentColleaguesHandler)

export default router
