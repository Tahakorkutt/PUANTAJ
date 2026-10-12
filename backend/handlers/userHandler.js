import { loginUser, logoutUser, registerUser, getDepartmentColleagues } from '../service/userService.js'

const createUserHandler = async (req, res) => {
  try {
    const { username, fullName, department, password } = req.body

    const user = await registerUser({
      username,
      fullName,
      department,
      password,
    })

    return res.status(201).json({
      success: true,
      message: 'Kullanıcı kaydı başarıyla oluşturuldu.',
      data: user,
    })
  } catch (error) {
    const statusCode = error.message.includes('zaten') ? 409 : 400

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    })
  }
}

const loginUserHandler = async (req, res) => {
  try {
    const { username, password } = req.body
    const user = await loginUser({ username, password })

    return res.status(200).json({
      success: true,
      message: 'Giriş başarılı.',
      data: user,
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    })
  }
}

const logoutUserHandler = async (req, res) => {
  try {
    const { username } = req.body
    const result = await logoutUser({ username })

    return res.status(200).json({
      success: true,
      message: result.message,
      data: { username: result.username },
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

const getDepartmentColleaguesHandler = async (req, res) => {
  try {
    const { username } = req.params
    const colleagues = await getDepartmentColleagues({ username })

    return res.status(200).json({
      success: true,
      data: colleagues,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}

export { createUserHandler, loginUserHandler, logoutUserHandler, getDepartmentColleaguesHandler }
