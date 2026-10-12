import { useEffect, useState } from 'react'
import './AdminPanel.css'

const adminSections = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'attendance', label: 'Puantaj Yönetimi' },
  { id: 'overtime', label: 'Fazla Mesai Bildirimi' },
  { id: 'shifts', label: 'Vardiya Değişim' },
  { id: 'leaves', label: 'İzin Talepleri' },
  { id: 'supervisors', label: 'Birim Sorumluları' },
]

const sectionTitles = {
  dashboard: 'Dashboard',
  attendance: 'Puantaj Yönetimi',
  shifts: 'Vardiya Değişim Talepleri',
  leaves: 'İzin Talepleri',
  overtime: 'Fazla Mesai Bildirimleri',
  supervisors: 'Birim Sorumluları',
}

const defaultDepartments = [
  'İnsan Kaynakları',
  'Muhasebe',
  'Üretim',
  'Satış',
  'Pazarlama',
  'Bilgi Teknojileri',
  'Lojistik',
  'Yönetim',
]

function AdminPanel({ adminUser, apiUrl, onLogout }) {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('dashboard')
  const [actionMessage, setActionMessage] = useState('')
  const [processingKey, setProcessingKey] = useState('')
  const [supervisorForm, setSupervisorForm] = useState({
    fullName: '',
    username: '',
    department: '',
    password: '',
  })
  const [supervisorSubmitting, setSupervisorSubmitting] = useState(false)

  const fetchDashboard = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }
    setError('')

    try {
      const response = await fetch(`${apiUrl}/admin/dashboard`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Admin verileri alınamadı.')
      }

      setDashboard(result.data)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Admin verileri alınamadı.')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  const handleShiftAction = async (id, action) => {
    const key = `shift-${id}-${action}`
    setProcessingKey(key)
    setActionMessage('')

    try {
      const response = await fetch(`${apiUrl}/admin/shift/${id}/${action}`, {
        method: 'PATCH',
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'İşlem başarısız.')
      }

      setActionMessage(result.message)
      await fetchDashboard({ silent: true })
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : 'İşlem başarısız.')
    } finally {
      setProcessingKey('')
    }
  }

  const handleLeaveAction = async (id, action) => {
    const key = `leave-${id}-${action}`
    setProcessingKey(key)
    setActionMessage('')

    try {
      const response = await fetch(`${apiUrl}/admin/leave/${id}/${action}`, {
        method: 'PATCH',
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'İşlem başarısız.')
      }

      setActionMessage(result.message)
      await fetchDashboard({ silent: true })
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : 'İşlem başarısız.')
    } finally {
      setProcessingKey('')
    }
  }

  const handleOvertimeAction = async (id, action) => {
    const key = `overtime-${id}-${action}`
    setProcessingKey(key)
    setActionMessage('')

    try {
      const response = await fetch(`${apiUrl}/admin/overtime/${id}/${action}`, {
        method: 'PATCH',
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'İşlem başarısız.')
      }

      setActionMessage(result.message)
      await fetchDashboard({ silent: true })
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : 'İşlem başarısız.')
    } finally {
      setProcessingKey('')
    }
  }

  const handleSupervisorFormChange = (event) => {
    const { name, value } = event.target
    setSupervisorForm((previous) => ({ ...previous, [name]: value }))
  }

  const handleSupervisorSubmit = async (event) => {
    event.preventDefault()
    setActionMessage('')
    setSupervisorSubmitting(true)

    try {
      const response = await fetch(`${apiUrl}/admin/supervisors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: supervisorForm.fullName,
          username: supervisorForm.username,
          department: supervisorForm.department,
          password: supervisorForm.password,
        }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Birim sorumlusu oluşturulamadı.')
      }

      setActionMessage(
        `${result.data.department} birimi için sorumlusu oluşturuldu: ${result.data.username}`,
      )
      setSupervisorForm({
        fullName: '',
        username: '',
        department: '',
        password: '',
      })
      await fetchDashboard({ silent: true })
    } catch (submitError) {
      setActionMessage(
        submitError instanceof Error ? submitError.message : 'Birim sorumlusu oluşturulamadı.',
      )
    } finally {
      setSupervisorSubmitting(false)
    }
  }


  const getShiftStatusClass = (status) => {
    if (
      status === 'Bekliyor' ||
      status === 'Personel Onayı Bekliyor' ||
      status === 'Admin Onayı Bekliyor'
    ) {
      return 'warning'
    }

    if (status === 'Onaylandı') {
      return 'success'
    }

    return 'muted'
  }

  const getLeaveStatusClass = (status) => {
    if (status === 'İnceleniyor') {
      return 'warning'
    }

    if (status === 'Onaylandı') {
      return 'success'
    }

    return 'muted'
  }

  const getOvertimeStatusClass = (status) => {
    if (status === 'Bekliyor') {
      return 'warning'
    }

    if (status === 'Onaylandı') {
      return 'success'
    }

    return 'muted'
  }

  useEffect(() => {
    fetchDashboard()
  }, [apiUrl])

  useEffect(() => {
    if (activeSection === 'overtime') {
      fetchDashboard({ silent: true })
    }
  }, [activeSection])

  const stats = dashboard?.stats || {
    totalPersonnel: 0,
    todayArrived: 0,
    onLeaveToday: 0,
  }

  const showStats = activeSection === 'dashboard'
  const showAttendance = activeSection === 'dashboard' || activeSection === 'attendance'
  const showShifts = activeSection === 'dashboard' || activeSection === 'shifts'
  const showLeaves = activeSection === 'dashboard' || activeSection === 'leaves'
  const showOvertime = activeSection === 'dashboard' || activeSection === 'overtime'
  const showSupervisors = activeSection === 'dashboard' || activeSection === 'supervisors'
  const overtimeRequests = Array.isArray(dashboard?.overtimeRequests)
    ? dashboard.overtimeRequests
    : []
  const supervisors = Array.isArray(dashboard?.supervisors) ? dashboard.supervisors : []
  const pendingOvertimeCount = overtimeRequests.filter((item) => item.status === 'Bekliyor').length

  const openSection = (sectionId) => {
    setActiveSection(sectionId)
    setActionMessage('')
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="brand-mark admin-mark">A</div>
          <div>
            <p className="eyebrow">YÖNETİM</p>
            <h2>Admin Panel</h2>
          </div>
        </div>

        <div className="admin-profile">
          <strong>{adminUser?.fullName || adminUser?.full_name || 'Admin'}</strong>
          <span>{adminUser?.username}</span>
        </div>

        <nav className="admin-nav">
          {adminSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? 'admin-nav-item active' : 'admin-nav-item'}
              onClick={() => openSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <button type="button" className="admin-logout" onClick={onLogout}>
          Çıkış
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow accent">Puantaj Yönetim Sistemi</p>
            <h1>{sectionTitles[activeSection]}</h1>
          </div>
          <div className="admin-topbar-actions">
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => fetchDashboard()}
            >
              Yenile
            </button>
            <button type="button" className="admin-topbar-logout" onClick={onLogout}>
              Çıkış
            </button>
          </div>
        </header>

        {loading && <p className="admin-message">Veriler yükleniyor...</p>}
        {error && <p className="admin-message error">{error}</p>}
        {actionMessage && <p className="admin-message">{actionMessage}</p>}

        {!loading && !error && dashboard && (
          <>
            {showStats && (
              <section className="admin-stats-grid">
                <article className="admin-stat-card blue">
                  <span>Toplam Personel</span>
                  <strong>{stats.totalPersonnel}</strong>
                </article>
                <article className="admin-stat-card green">
                  <span>Bugün Gelen</span>
                  <strong>{stats.todayArrived}</strong>
                </article>
                <article className="admin-stat-card amber">
                  <span>İzinli Personeller</span>
                  <strong>{stats.onLeaveToday}</strong>
                </article>
                <article
                  className="admin-stat-card orange"
                  role="button"
                  tabIndex={0}
                  onClick={() => openSection('overtime')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      openSection('overtime')
                    }
                  }}
                >
                  <span>Bekleyen Fazla Mesai</span>
                  <strong>{pendingOvertimeCount}</strong>
                </article>
                <article
                  className="admin-stat-card blue"
                  role="button"
                  tabIndex={0}
                  onClick={() => openSection('supervisors')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      openSection('supervisors')
                    }
                  }}
                >
                  <span>Birim Sorumlusu</span>
                  <strong>{supervisors.length}</strong>
                </article>
              </section>
            )}

            {showAttendance && (
              <section className="admin-section" id="admin-attendance">
                <div className="admin-section-header">
                  <h3>Puantaj Yönetimi</h3>
                  <span className="status-badge light">{dashboard.attendanceRows.length}</span>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Departman</th>
                        <th>Tarih</th>
                        <th>Giriş</th>
                        <th>Çıkış</th>
                        <th>Süre</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.attendanceRows.length > 0 ? (
                        dashboard.attendanceRows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.personnel}</td>
                            <td>{row.department || '-'}</td>
                            <td>{row.date}</td>
                            <td>{row.checkin}</td>
                            <td>{row.checkout}</td>
                            <td>{row.duration}</td>
                            <td>
                              <span
                                className={`admin-status ${
                                  row.status === 'Tamamlandı'
                                    ? 'success'
                                    : row.status === 'Devam ediyor'
                                      ? 'warning'
                                      : 'muted'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-cell">
                            Henüz puantaj kaydı yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {showOvertime && (
              <section className="admin-section" id="admin-overtime">
                <div className="admin-section-header">
                  <h3>Fazla Mesai Bildirimleri</h3>
                  <span className="status-badge light">{overtimeRequests.length}</span>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Departman</th>
                        <th>Tarih</th>
                        <th>Süre (Saat)</th>
                        <th>Neden</th>
                        <th>Durum</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overtimeRequests.length > 0 ? (
                        overtimeRequests.map((item) => (
                          <tr key={item.id}>
                            <td>{item.full_name || item.username}</td>
                            <td>{item.department || '-'}</td>
                            <td>{item.overtime_date}</td>
                            <td>{item.overtime_hours}</td>
                            <td className="description-cell">{item.reason || '-'}</td>
                            <td>
                              <span className={`admin-status ${getOvertimeStatusClass(item.status)}`}>
                                {item.status}
                              </span>
                            </td>
                            <td>
                              {item.status === 'Bekliyor' ? (
                                <div className="admin-action-buttons">
                                  <button
                                    type="button"
                                    className="admin-action-btn approve"
                                    disabled={processingKey === `overtime-${item.id}-approve`}
                                    onClick={() => handleOvertimeAction(item.id, 'approve')}
                                  >
                                    Onayla
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-action-btn reject"
                                    disabled={processingKey === `overtime-${item.id}-reject`}
                                    onClick={() => handleOvertimeAction(item.id, 'reject')}
                                  >
                                    Reddet
                                  </button>
                                </div>
                              ) : (
                                <span className="admin-action-done">Tamamlandı</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-cell">
                            Henüz fazla mesai bildirimi yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {showShifts && (
              <section className="admin-section" id="admin-shifts">
                <div className="admin-section-header">
                  <h3>Vardiya Değişim Talepleri</h3>
                  <span className="status-badge light">{dashboard.shiftRequests.length}</span>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>Karşı Personel</th>
                        <th>Benim Günüm</th>
                        <th>Değişim Günü</th>
                        <th>Açıklama</th>
                        <th>Durum</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.shiftRequests.length > 0 ? (
                        dashboard.shiftRequests.map((item) => (
                          <tr key={item.id}>
                            <td>{item.requester_name || item.username}</td>
                            <td>{item.counterpart_name || item.counterpart_username}</td>
                            <td>{item.my_shift_date}</td>
                            <td>{item.swap_date}</td>
                            <td className="description-cell">{item.description || '-'}</td>
                            <td>
                              <span className={`admin-status ${getShiftStatusClass(item.status)}`}>
                                {item.status}
                              </span>
                            </td>
                            <td>
                              {item.status === 'Admin Onayı Bekliyor' ? (
                                <div className="admin-action-buttons">
                                  <button
                                    type="button"
                                    className="admin-action-btn approve"
                                    disabled={processingKey === `shift-${item.id}-approve`}
                                    onClick={() => handleShiftAction(item.id, 'approve')}
                                  >
                                    Onayla
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-action-btn reject"
                                    disabled={processingKey === `shift-${item.id}-reject`}
                                    onClick={() => handleShiftAction(item.id, 'reject')}
                                  >
                                    Reddet
                                  </button>
                                </div>
                              ) : item.status === 'Personel Onayı Bekliyor' ||
                                item.status === 'Bekliyor' ? (
                                <span className="admin-action-done">Personel onayı bekleniyor</span>
                              ) : (
                                <span className="admin-action-done">Tamamlandı</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-cell">
                            Henüz vardiya değişim talebi yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {showLeaves && (
              <section className="admin-section" id="admin-leaves">
                <div className="admin-section-header">
                  <h3>İzin Talepleri</h3>
                  <span className="status-badge light">{dashboard.leaveRequests.length}</span>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>İzin Türü</th>
                        <th>Başlangıç</th>
                        <th>Bitiş</th>
                        <th>Açıklama</th>
                        <th>Durum</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.leaveRequests.length > 0 ? (
                        dashboard.leaveRequests.map((item) => (
                          <tr key={item.id}>
                            <td>{item.full_name || item.username}</td>
                            <td>{item.leave_type}</td>
                            <td>{item.start_date}</td>
                            <td>{item.end_date}</td>
                            <td className="description-cell">{item.description || '-'}</td>
                            <td>
                              <span className={`admin-status ${getLeaveStatusClass(item.status)}`}>
                                {item.status}
                              </span>
                            </td>
                            <td>
                              {item.status === 'İnceleniyor' ? (
                                <div className="admin-action-buttons">
                                  <button
                                    type="button"
                                    className="admin-action-btn approve"
                                    disabled={processingKey === `leave-${item.id}-approve`}
                                    onClick={() => handleLeaveAction(item.id, 'approve')}
                                  >
                                    Onayla
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-action-btn reject"
                                    disabled={processingKey === `leave-${item.id}-reject`}
                                    onClick={() => handleLeaveAction(item.id, 'reject')}
                                  >
                                    Reddet
                                  </button>
                                </div>
                              ) : (
                                <span className="admin-action-done">Tamamlandı</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-cell">
                            Henüz izin talebi yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {showSupervisors && (
              <section className="admin-section" id="admin-supervisors">
                <div className="admin-section-header">
                  <h3>Birim Sorumlusu Kaydı</h3>
                  <span className="status-badge light">{supervisors.length}</span>
                </div>

                <form className="admin-form" onSubmit={handleSupervisorSubmit}>
                  <label>
                    Ad soyad
                    <input
                      type="text"
                      name="fullName"
                      value={supervisorForm.fullName}
                      onChange={handleSupervisorFormChange}
                      placeholder="Örn: Mehmet Yılmaz"
                      required
                    />
                  </label>
                  <label>
                    Kullanıcı adı
                    <input
                      type="text"
                      name="username"
                      value={supervisorForm.username}
                      onChange={handleSupervisorFormChange}
                      placeholder="Örn: muhasebesorumlu"
                      required
                    />
                  </label>
                  <label>
                    Departman / Birim
                    <select
                      name="department"
                      value={supervisorForm.department}
                      onChange={handleSupervisorFormChange}
                      required
                    >
                      <option value="">Birim seçin</option>
                      {defaultDepartments.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Şifre
                    <input
                      type="password"
                      name="password"
                      value={supervisorForm.password}
                      onChange={handleSupervisorFormChange}
                      placeholder="En az 8 karakter"
                      minLength={8}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary-button small-button form-submit"
                    disabled={supervisorSubmitting}
                  >
                    {supervisorSubmitting ? 'Kaydediliyor...' : 'Birim Sorumlusu Oluştur'}
                  </button>
                </form>

                <div className="admin-table-wrap" style={{ marginTop: 24 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Ad Soyad</th>
                        <th>Kullanıcı Adı</th>
                        <th>Birim</th>
                        <th>Rol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supervisors.length > 0 ? (
                        supervisors.map((item) => (
                          <tr key={item.id}>
                            <td>{item.full_name}</td>
                            <td>{item.username}</td>
                            <td>{item.department || '-'}</td>
                            <td>
                              <span className="admin-status success">Birim Sorumlusu</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="empty-cell">
                            Henüz birim sorumlusu kaydı yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default AdminPanel
