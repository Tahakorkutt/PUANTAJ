import db from '../config/database.js'

const createOvertimeTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS overtime_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          overtime_date TEXT NOT NULL,
          overtime_hours REAL NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Bekliyor'
            CHECK(status IN ('Bekliyor', 'Onaylandı', 'Reddedildi')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      (err) => {
        if (err) {
          reject(err)
          return
        }

        resolve()
      },
    )
  })
}

const createOvertimeRequest = ({ username, overtimeDate, overtimeHours, reason }) => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        INSERT INTO overtime_requests (username, overtime_date, overtime_hours, reason, status)
        VALUES (?, ?, ?, ?, 'Bekliyor')
      `,
      [username, overtimeDate, overtimeHours, reason],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        resolve({
          id: this.lastID,
          username,
          overtime_date: overtimeDate,
          overtime_hours: overtimeHours,
          reason,
          status: 'Bekliyor',
          created_at: new Date().toISOString(),
        })
      },
    )
  })
}

const getOvertimeRequestsByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT * FROM overtime_requests
        WHERE username = ?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [username],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve(rows)
      },
    )
  })
}

const getAllOvertimeRequests = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          o.*,
          u.full_name,
          u.department
        FROM overtime_requests o
        LEFT JOIN users u ON u.username = o.username
        ORDER BY o.created_at DESC
        LIMIT 100
      `,
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve(rows || [])
      },
    )
  })
}

const getOvertimeRequestsByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          o.*,
          u.full_name,
          u.department
        FROM overtime_requests o
        INNER JOIN users u ON u.username = o.username
        WHERE u.department = ?
        ORDER BY o.created_at DESC
        LIMIT 100
      `,
      [department],
      (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        resolve(rows || [])
      },
    )
  })
}

const getOvertimeRequestById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT
          o.*,
          u.full_name,
          u.department
        FROM overtime_requests o
        LEFT JOIN users u ON u.username = o.username
        WHERE o.id = ?
      `,
      [id],
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row || null)
      },
    )
  })
}

const updateOvertimeRequestStatus = (id, status) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE overtime_requests SET status = ? WHERE id = ?`,
      [status, id],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        if (this.changes === 0) {
          reject(new Error('Fazla mesai bildirimi bulunamadı.'))
          return
        }

        resolve({ id, status })
      },
    )
  })
}

export {
  createOvertimeTable,
  createOvertimeRequest,
  getOvertimeRequestsByUsername,
  getAllOvertimeRequests,
  getOvertimeRequestsByDepartment,
  getOvertimeRequestById,
  updateOvertimeRequestStatus,
}
