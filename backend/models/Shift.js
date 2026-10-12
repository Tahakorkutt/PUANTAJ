import db from '../config/database.js'

const STATUS = {
  PEER_PENDING: 'Personel Onayı Bekliyor',
  ADMIN_PENDING: 'Admin Onayı Bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
}

const createShiftTable = () => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        CREATE TABLE IF NOT EXISTS shift_change_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          counterpart_username TEXT NOT NULL,
          my_shift_date TEXT NOT NULL,
          swap_date TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Personel Onayı Bekliyor',
          peer_status TEXT NOT NULL DEFAULT 'Bekliyor',
          admin_status TEXT NOT NULL DEFAULT 'Bekliyor',
          swapped INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      (err) => {
        if (err) {
          reject(err)
          return
        }

        migrateShiftTable()
          .then(resolve)
          .catch(reject)
      },
    )
  })
}

const rebuildShiftTableWithoutStatusCheck = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION')

      db.run(
        `
          CREATE TABLE IF NOT EXISTS shift_change_requests_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            counterpart_username TEXT NOT NULL,
            my_shift_date TEXT NOT NULL,
            swap_date TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Personel Onayı Bekliyor',
            peer_status TEXT NOT NULL DEFAULT 'Bekliyor',
            admin_status TEXT NOT NULL DEFAULT 'Bekliyor',
            swapped INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `,
        (createErr) => {
          if (createErr) {
            db.run('ROLLBACK')
            reject(createErr)
            return
          }

          db.run(
            `
              INSERT INTO shift_change_requests_new (
                id, username, counterpart_username, my_shift_date, swap_date,
                description, status, peer_status, admin_status, swapped, created_at
              )
              SELECT
                id,
                username,
                counterpart_username,
                my_shift_date,
                swap_date,
                description,
                CASE WHEN status = 'Bekliyor' THEN 'Personel Onayı Bekliyor' ELSE status END,
                CASE
                  WHEN status = 'Onaylandı' THEN 'Onaylandı'
                  WHEN status = 'Reddedildi' THEN 'Reddedildi'
                  ELSE 'Bekliyor'
                END,
                CASE
                  WHEN status = 'Onaylandı' THEN 'Onaylandı'
                  WHEN status = 'Reddedildi' THEN 'Reddedildi'
                  ELSE 'Bekliyor'
                END,
                0,
                created_at
              FROM shift_change_requests
            `,
            (copyErr) => {
              if (copyErr) {
                db.run('ROLLBACK')
                reject(copyErr)
                return
              }

              finishRebuild(resolve, reject)
            },
          )
        },
      )
    })
  })
}

const finishRebuild = (resolve, reject) => {
  db.run('DROP TABLE shift_change_requests', (dropErr) => {
    if (dropErr) {
      db.run('ROLLBACK')
      reject(dropErr)
      return
    }

    db.run(
      'ALTER TABLE shift_change_requests_new RENAME TO shift_change_requests',
      (renameErr) => {
        if (renameErr) {
          db.run('ROLLBACK')
          reject(renameErr)
          return
        }

        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            reject(commitErr)
            return
          }
          resolve()
        })
      },
    )
  })
}

const migrateShiftTable = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'shift_change_requests'`,
      (schemaErr, row) => {
        if (schemaErr) {
          reject(schemaErr)
          return
        }

        const schemaSql = row?.sql || ''
        const hasLegacyStatusCheck =
          schemaSql.includes("CHECK(status IN ('Bekliyor'") ||
          schemaSql.includes('CHECK(status IN ("Bekliyor"')

        if (hasLegacyStatusCheck) {
          rebuildShiftTableWithoutStatusCheck().then(resolve).catch(reject)
          return
        }

        db.all('PRAGMA table_info(shift_change_requests)', (err, columns) => {
          if (err) {
            reject(err)
            return
          }

          const names = (columns || []).map((column) => column.name)
          const migrations = []

          if (!names.includes('peer_status')) {
            migrations.push(
              "ALTER TABLE shift_change_requests ADD COLUMN peer_status TEXT NOT NULL DEFAULT 'Bekliyor'",
            )
          }

          if (!names.includes('admin_status')) {
            migrations.push(
              "ALTER TABLE shift_change_requests ADD COLUMN admin_status TEXT NOT NULL DEFAULT 'Bekliyor'",
            )
          }

          if (!names.includes('swapped')) {
            migrations.push(
              'ALTER TABLE shift_change_requests ADD COLUMN swapped INTEGER NOT NULL DEFAULT 0',
            )
          }

          const runMigration = (index) => {
            if (index >= migrations.length) {
              db.run(
                `
                  UPDATE shift_change_requests
                  SET status = 'Personel Onayı Bekliyor'
                  WHERE status = 'Bekliyor'
                `,
                (updateErr) => {
                  if (updateErr) {
                    reject(updateErr)
                    return
                  }
                  resolve()
                },
              )
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

const createShiftRequest = ({
  username,
  counterpartUsername,
  myShiftDate,
  swapDate,
  description = '',
}) => {
  return new Promise((resolve, reject) => {
    db.run(
      `
        INSERT INTO shift_change_requests (
          username,
          counterpart_username,
          my_shift_date,
          swap_date,
          description,
          status,
          peer_status,
          admin_status,
          swapped
        )
        VALUES (?, ?, ?, ?, ?, ?, 'Bekliyor', 'Bekliyor', 0)
      `,
      [
        username,
        counterpartUsername,
        myShiftDate,
        swapDate,
        description,
        STATUS.PEER_PENDING,
      ],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        resolve({
          id: this.lastID,
          username,
          counterpart_username: counterpartUsername,
          my_shift_date: myShiftDate,
          swap_date: swapDate,
          description,
          status: STATUS.PEER_PENDING,
          peer_status: 'Bekliyor',
          admin_status: 'Bekliyor',
          swapped: 0,
          created_at: new Date().toISOString(),
        })
      },
    )
  })
}

const getShiftRequestsByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          s.*,
          requester.full_name AS requester_name,
          counterpart.full_name AS counterpart_name,
          CASE
            WHEN s.username = ? THEN 'outgoing'
            ELSE 'incoming'
          END AS direction
        FROM shift_change_requests s
        LEFT JOIN users requester ON requester.username = s.username
        LEFT JOIN users counterpart ON counterpart.username = s.counterpart_username
        WHERE s.username = ? OR s.counterpart_username = ?
        ORDER BY s.created_at DESC
        LIMIT 100
      `,
      [username, username, username],
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

const getAllShiftRequests = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          s.*,
          u.full_name AS requester_name,
          u.department AS requester_department,
          c.full_name AS counterpart_name
        FROM shift_change_requests s
        LEFT JOIN users u ON u.username = s.username
        LEFT JOIN users c ON c.username = s.counterpart_username
        ORDER BY s.created_at DESC
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

const getShiftRequestsByDepartment = (department) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          s.*,
          u.full_name AS requester_name,
          u.department AS requester_department,
          c.full_name AS counterpart_name
        FROM shift_change_requests s
        INNER JOIN users u ON u.username = s.username
        LEFT JOIN users c ON c.username = s.counterpart_username
        WHERE u.department = ?
        ORDER BY s.created_at DESC
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

const getShiftRequestById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT
          s.*,
          u.full_name AS requester_name,
          u.department AS requester_department,
          c.full_name AS counterpart_name
        FROM shift_change_requests s
        LEFT JOIN users u ON u.username = s.username
        LEFT JOIN users c ON c.username = s.counterpart_username
        WHERE s.id = ?
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

const updateShiftRequestFields = (id, fields) => {
  const entries = Object.entries(fields)
  if (entries.length === 0) {
    return Promise.resolve({ id })
  }

  const setters = entries.map(([key]) => `${key} = ?`).join(', ')
  const values = entries.map(([, value]) => value)

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE shift_change_requests SET ${setters} WHERE id = ?`,
      [...values, id],
      function (err) {
        if (err) {
          reject(err)
          return
        }

        if (this.changes === 0) {
          reject(new Error('Vardiya değişim talebi bulunamadı.'))
          return
        }

        resolve({ id, ...fields })
      },
    )
  })
}

const updateShiftRequestStatus = (id, status) => {
  return updateShiftRequestFields(id, { status })
}

const applyShiftSwapAttendance = ({
  username,
  counterpartUsername,
  myShiftDate,
  swapDate,
}) => {
  return new Promise((resolve, reject) => {
    const tempUser = `__swap_tmp_${Date.now()}__`

    db.serialize(() => {
      db.run('BEGIN TRANSACTION')

      db.run(
        `
          UPDATE attendance_logs
          SET username = ?
          WHERE username = ?
            AND date(created_at, '+3 hours') = ?
        `,
        [tempUser, username, myShiftDate],
        (err1) => {
          if (err1) {
            db.run('ROLLBACK')
            reject(err1)
            return
          }

          db.run(
            `
              UPDATE attendance_logs
              SET username = ?
              WHERE username = ?
                AND date(created_at, '+3 hours') = ?
            `,
            [username, counterpartUsername, swapDate],
            (err2) => {
              if (err2) {
                db.run('ROLLBACK')
                reject(err2)
                return
              }

              db.run(
                `
                  UPDATE attendance_logs
                  SET username = ?
                  WHERE username = ?
                    AND date(created_at, '+3 hours') = ?
                `,
                [counterpartUsername, tempUser, myShiftDate],
                (err3) => {
                  if (err3) {
                    db.run('ROLLBACK')
                    reject(err3)
                    return
                  }

                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      reject(commitErr)
                      return
                    }
                    resolve(true)
                  })
                },
              )
            },
          )
        },
      )
    })
  })
}

export {
  STATUS,
  createShiftTable,
  createShiftRequest,
  getShiftRequestsByUsername,
  getAllShiftRequests,
  getShiftRequestsByDepartment,
  getShiftRequestById,
  updateShiftRequestStatus,
  updateShiftRequestFields,
  applyShiftSwapAttendance,
}
