import db from '../config/database.js'

const createUsersTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          department TEXT DEFAULT '',
          role TEXT NOT NULL DEFAULT 'user',
          password TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      (err) => {
        if (err) {
          reject(err)
          return
        }

        db.all('PRAGMA table_info(users)', (pragmaErr, columns) => {
          if (pragmaErr) {
            reject(pragmaErr)
            return
          }

          const migrations = []

          if (!columns.some((column) => column.name === 'department')) {
            migrations.push("ALTER TABLE users ADD COLUMN department TEXT DEFAULT ''")
          }

          if (!columns.some((column) => column.name === 'role')) {
            migrations.push("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
          }

          const runMigration = (index) => {
            if (index >= migrations.length) {
              resolve()
              return
            }

            db.run(migrations[index], (alterErr) => {
              if (alterErr) {
                reject(alterErr)
                return
              }

              runMigration(index + 1)
            })
          }

          runMigration(0)
        })
      },
    )
  })
}

const findByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        reject(err)
        return
      }

      resolve(row)
    })
  })
}

const findRegisteredUsersWithDepartment = (excludeUsername, department) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT id, username, full_name, department
        FROM users
        WHERE TRIM(COALESCE(department, '')) != ''
          AND TRIM(department) = TRIM(?)
          AND username != ?
          AND COALESCE(role, 'user') = 'user'
        ORDER BY full_name ASC
      `,
      [department, excludeUsername],
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

const countAllUsers = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) AS total FROM users WHERE COALESCE(role, 'user') != 'admin'`,
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row?.total || 0)
      },
    )
  })
}

const countUsersByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT COUNT(*) AS total
        FROM users
        WHERE department = ?
          AND COALESCE(role, 'user') NOT IN ('admin')
      `,
      [department],
      (err, row) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row?.total || 0)
      },
    )
  })
}

const createUser = ({ username, fullName, department = '', passwordHash, role = 'user' }) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, full_name, department, role, password) VALUES (?, ?, ?, ?, ?)',
      [username, fullName, department, role, passwordHash],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        resolve({ id: this.lastID, username, full_name: fullName, department, role })
      },
    )
  })
}

const findAllSupervisors = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT id, username, full_name, department, role, created_at
        FROM users
        WHERE role = 'supervisor'
        ORDER BY department ASC, full_name ASC
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

const findSupervisorByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT id, username, full_name, department, role
        FROM users
        WHERE role = 'supervisor'
          AND department = ?
        LIMIT 1
      `,
      [department],
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

const DEPARTMENT_RENAMES = {
  Muhasebe: 'muhasebe',
  Üretim: 'üretim',
  Satış: 'satış',
  Pazarlama: 'pazarlama',
  'Bilgi Teknolojileri': 'bilgi teknolojileri',
  Lojistik: 'lojistik',
  Yönetim: 'yönetim',
}

const normalizeUserDepartments = () => {
  return new Promise((resolve, reject) => {
    const entries = Object.entries(DEPARTMENT_RENAMES)
    const runNext = (index) => {
      if (index >= entries.length) {
        // Birimi boş kalan eski demo kullanıcılar (kayıt alanı sonradan eklendi).
        db.run(
          `
            UPDATE users
            SET department = 'bilgi teknolojileri'
            WHERE username IN ('aysekaya', 'taha35')
              AND TRIM(COALESCE(department, '')) = ''
          `,
          (backfillErr) => {
            if (backfillErr) {
              reject(backfillErr)
              return
            }
            resolve()
          },
        )
        return
      }

      const [from, to] = entries[index]
      db.run('UPDATE users SET department = ? WHERE department = ?', [to, from], (err) => {
        if (err) {
          reject(err)
          return
        }

        runNext(index + 1)
      })
    }

    runNext(0)
  })
}

export {
  createUsersTable,
  findByUsername,
  createUser,
  findRegisteredUsersWithDepartment,
  countAllUsers,
  countUsersByDepartment,
  findAllSupervisors,
  findSupervisorByDepartment,
  normalizeUserDepartments,
}
