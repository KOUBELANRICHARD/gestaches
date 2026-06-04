import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const views = ['journee', 'ajouter', 'taches', 'objectifs', 'projet', 'chat', 'historique'];

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  }).then((response) => {
    if (!response.ok) throw new Error(`Erreur ${response.status}`);
    return response.json();
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function App() {
  const [payload, setPayload] = useState(null);
  const [auth, setAuth] = useState({ checked: false, authenticated: false, needsSetup: false, user: null });
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [view, setView] = useState('journee');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(new Date());
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [profilePanel, setProfilePanel] = useState(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState(weekStartDate(dateInputValue(new Date())));
  const [selectedDate, setSelectedDate] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [workFilters, setWorkFilters] = useState({ employer: '', category: '', location: '' });
  const [editTaskForm, setEditTaskForm] = useState({ title: '', category: 'general', durationMinutes: 45, priority: 'medium', dueDate: '' });
  const [taskForm, setTaskForm] = useState({ title: '', category: 'formation', durationMinutes: 45, priority: 'medium', dueDate: '' });
  const [eventForm, setEventForm] = useState({ title: 'Travail', type: 'work', startAt: '', endAt: '', employer: '', location: '', jobCategory: '', project: '' });
  const [goalForm, setGoalForm] = useState({ title: '', horizon: 'court terme', category: 'aws' });
  const [trainingForm, setTrainingForm] = useState({ title: '', category: 'formation' });
  const [settingsForm, setSettingsForm] = useState({ dailyPlanTime: '06:30', reminderMinutesBefore: 30, timezone: 'America/Moncton' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });

  useEffect(() => {
    checkAuth();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!payload?.state?.profile) return;
    setSettingsForm({
      dailyPlanTime: payload.state.profile.dailyPlanTime,
      reminderMinutesBefore: payload.state.profile.reminderMinutesBefore,
      timezone: payload.state.profile.timezone
    });
  }, [payload?.state?.profile?.dailyPlanTime, payload?.state?.profile?.reminderMinutesBefore, payload?.state?.profile?.timezone]);

  useEffect(() => {
    if (!payload?.schedule?.length) return;
    if (payload.schedule.some((day) => day.date === selectedDate)) return;
    const timezoneToday = dateInTimezone(new Date(), payload.state.profile.timezone);
    const matchingToday = payload.schedule.find((day) => day.date === timezoneToday);
    setSelectedDate((matchingToday || payload.schedule[0]).date);
  }, [payload?.schedule, payload?.state?.profile?.timezone, selectedDate]);

  async function checkAuth() {
    const status = await api('/api/auth/status');
    setAuth({ ...status, checked: true });
    if (status.authenticated) await refresh();
  }

  async function refresh(weekStart = selectedWeekStart) {
    try {
      setPayload(await api(`/api/state?weekStart=${encodeURIComponent(weekStart)}`));
    } catch (error) {
      setPayload(null);
      const status = await api('/api/auth/status');
      setAuth({ ...status, checked: true });
    }
  }

  async function changeWeek(weekStart) {
    setSelectedWeekStart(weekStart);
    setSelectedDate(weekStart);
    await refresh(weekStart);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true);
    setAuthError('');
    try {
      const path = auth.needsSetup ? '/api/auth/register' : '/api/auth/login';
      const result = await api(path, {
        method: 'POST',
        body: JSON.stringify(authForm)
      });
      setAuth({ checked: true, authenticated: true, needsSetup: false, user: result.user });
      await refresh();
    } catch (error) {
      setAuthError(auth.needsSetup ? 'Creation impossible. Mot de passe: 8 caracteres minimum.' : 'Email ou mot de passe invalide.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    setPayload(null);
    setAuth({ checked: true, authenticated: false, needsSetup: false, user: null });
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = message.trim();
    if (!content) return;
    setMessage('');
    setBusy(true);
    try {
      const data = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content })
      });
      setPayload((current) => ({ ...current, ...data }));
    } finally {
      setBusy(false);
    }
  }

  async function setTaskStatus(id, status) {
    const data = await api(`/api/tasks/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    setPayload((current) => ({ ...current, ...data }));
  }

  async function taskAction(id, action) {
    setBusy(true);
    try {
      const data = await api(`/api/tasks/${id}/${action}`, {
        method: 'POST',
        body: '{}'
      });
      setPayload((current) => ({ ...current, ...data }));
    } finally {
      setBusy(false);
    }
  }

  function openTaskEditor(task) {
    setEditingTaskId(task.id);
    setEditTaskForm({
      title: task.title,
      category: task.category || 'general',
      durationMinutes: task.durationMinutes || 45,
      priority: task.priority || 'medium',
      dueDate: task.dueDate || ''
    });
  }

  async function saveTaskEdit(event, id) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editTaskForm)
      });
      setPayload((current) => ({ ...current, ...data }));
      setEditingTaskId(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!window.confirm(`Supprimer cette tache ?\n${task?.title || ''}`)) return;
    setBusy(true);
    try {
      const data = await api(`/api/tasks/${id}`, {
        method: 'DELETE'
      });
      setPayload((current) => ({ ...current, ...data }));
      if (editingTaskId === id) setEditingTaskId(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(id) {
    const event = state.events.find((item) => item.id === id);
    if (!window.confirm(`Supprimer cet horaire ?\n${event?.title || ''}`)) return;
    setBusy(true);
    try {
      const data = await api(`/api/events/${id}`, {
        method: 'DELETE'
      });
      setPayload((current) => ({ ...current, ...data }));
    } finally {
      setBusy(false);
    }
  }

  async function createItem(path, body, reset) {
    setBusy(true);
    setNotice('');
    try {
      const data = await api(path, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setPayload((current) => ({ ...current, ...data }));
      reset();
      setNotice('Ajout enregistre.');
    } catch (error) {
      setNotice("Je n'ai pas pu enregistrer. Verifie les champs.");
    } finally {
      setBusy(false);
    }
  }

  function createTask(event) {
    event.preventDefault();
    createItem('/api/tasks', taskForm, () => setTaskForm({ title: '', category: 'formation', durationMinutes: 45, priority: 'medium', dueDate: '' }));
  }

  function createEvent(event) {
    event.preventDefault();
    createItem('/api/events', eventForm, () => setEventForm({ title: 'Travail', type: 'work', startAt: '', endAt: '', employer: '', location: '', jobCategory: '', project: '' }));
  }

  function createGoal(event) {
    event.preventDefault();
    createItem('/api/goals', goalForm, () => setGoalForm({ title: '', horizon: 'court terme', category: 'aws' }));
  }

  function createTraining(event) {
    event.preventDefault();
    createItem('/api/trainings', trainingForm, () => setTrainingForm({ title: '', category: 'formation' }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    await createItem('/api/settings', settingsForm, () => {});
  }

  async function changePassword(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      await api('/api/account/password', {
        method: 'POST',
        body: JSON.stringify(passwordForm)
      });
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setNotice('Mot de passe modifie.');
    } catch (error) {
      setNotice('Mot de passe non modifie. Verifie le mot de passe actuel.');
    } finally {
      setBusy(false);
    }
  }

  async function enableNotifications() {
    if (!payload?.config?.publicVapidKey) {
      setNotice('Ajoute les cles VAPID sur le serveur.');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotice('Notifications push non supportees sur ce navigateur.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setNotice('Permission refusee.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(payload.config.publicVapidKey)
    });
    await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription })
    });
    await api('/api/push/test', { method: 'POST', body: '{}' });
    setNotice('Notifications activees.');
  }

  async function downloadBackup() {
    setNotice('');
    try {
      const response = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('backup');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gestaches-backup-${dateInputValue(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setNotice('Sauvegarde telechargee.');
    } catch {
      setNotice("Sauvegarde impossible pour l'instant.");
    }
  }

  if (!auth.checked) return <div className="loading">Chargement...</div>;
  if (!auth.authenticated) {
    return (
      <AuthScreen
        needsSetup={auth.needsSetup}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authError={authError}
        busy={busy}
        onSubmit={submitAuth}
      />
    );
  }
  if (!payload) return <div className="loading">Chargement...</div>;

  const { state, schedule, history, config } = payload;
  const timezoneToday = dateInTimezone(new Date(), state.profile.timezone);
  const today = schedule.find((day) => day.date === timezoneToday) || schedule[0];
  const selectedDay = schedule.find((day) => day.date === selectedDate) || today;
  const monthWeeks = monthWeeksFor(new Date(), state.profile.timezone);
  const activeTasks = state.tasks.filter((task) => task.status !== 'done');
  const upcomingEvents = [...state.events].sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 6);
  const filteredWorkEvents = state.events
    .filter((event) => event.type === 'work')
    .filter((event) => !workFilters.employer || event.employer === workFilters.employer)
    .filter((event) => !workFilters.category || event.jobCategory === workFilters.category)
    .filter((event) => !workFilters.location || event.location === workFilters.location)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const filterOptions = {
    employers: uniqueValues([
      ...state.workProfiles.map((profile) => profile.employer),
      ...state.events.map((event) => event.employer)
    ]),
    categories: uniqueValues([
      ...state.workProfiles.map((profile) => profile.category),
      ...state.events.map((event) => event.jobCategory)
    ]),
    locations: uniqueValues([
      ...state.workProfiles.flatMap((profile) => profile.locations || []),
      ...state.events.map((event) => event.location)
    ])
  };
  const localDateTime = new Intl.DateTimeFormat('fr-CA', {
    timeZone: state.profile.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(clock);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow header-meta">
            <span>Petit-Rocher NB</span>
            <span>{state.profile.timezone}</span>
            <time>{localDateTime}</time>
          </p>
          <h1>Gestaches</h1>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={refresh} aria-label="Actualiser">R</button>
          <div className="avatar-wrap">
            <button className="avatar-button" onClick={() => setAvatarOpen((open) => !open)} aria-label="Mon compte">
              {(auth.user?.email || 'U').charAt(0).toUpperCase()}
            </button>
            {avatarOpen && (
              <div className="avatar-menu">
                <button onClick={() => { setProfilePanel('profile'); setAvatarOpen(false); }}>Mon profil</button>
                <button onClick={() => { setProfilePanel('settings'); setAvatarOpen(false); }}>Parametrage</button>
                <button onClick={logout}>Deconnexion</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {profilePanel && (
        <ProfilePanel
          mode={profilePanel}
          user={auth.user}
          state={state}
          config={config}
          notice={notice}
          busy={busy}
          settingsForm={settingsForm}
          setSettingsForm={setSettingsForm}
          passwordForm={passwordForm}
          setPasswordForm={setPasswordForm}
          onClose={() => setProfilePanel(null)}
          onEnableNotifications={enableNotifications}
          onDownloadBackup={downloadBackup}
          onSaveSettings={saveSettings}
          onChangePassword={changePassword}
        />
      )}

      <section className="hero-band">
        <div>
          <span>Aujourd'hui</span>
          <strong>{today.label}</strong>
        </div>
        <div>
          <span>Taches actives</span>
          <strong>{activeTasks.length}</strong>
        </div>
        <div>
          <span>Travail cible</span>
          <strong>{state.profile.weeklyWorkTargetHours} h</strong>
        </div>
      </section>

      <nav className="tabs" aria-label="Sections">
        {views.map((item) => (
          <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
            {item}
          </button>
        ))}
      </nav>

      {view === 'journee' && (
        <section className="content-grid">
          <Panel title={`Plan - ${selectedDay.label}`}>
            <div className="timeline">
              {selectedDay.blocks.length === 0 && <p className="muted">Aucun bloc planifie.</p>}
              {selectedDay.blocks.map((block) => <Block key={block.id} block={block} />)}
            </div>
          </Panel>

          <Panel title="Horaires">
            <div className="list">
              {upcomingEvents.length === 0 && <p className="muted">Aucun horaire ajoute.</p>}
              {upcomingEvents.map((event) => (
                <article className="list-item" key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{formatDate(event.startAt, state.profile.timezone)} / {formatTime(event.startAt, state.profile.timezone)} - {formatTime(event.endAt, state.profile.timezone)}</span>
                  <span>{eventStatusLabel(event.status)}</span>
                  {(event.employer || event.location || event.jobCategory) && (
                    <span>{[event.employer, event.location, event.jobCategory].filter(Boolean).join(' / ')}</span>
                  )}
                  <div className="task-actions">
                    <button className="danger-action" onClick={() => deleteEvent(event.id)} disabled={busy}>Supprimer</button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Semaine">
            <div className="week-controls">
              <select value={selectedWeekStart} onChange={(event) => changeWeek(event.target.value)}>
                {monthWeeks.map((week) => (
                  <option key={week.startDate} value={week.startDate}>{week.label}</option>
                ))}
              </select>
            </div>
            <div className="week-strip">
              {schedule.map((day) => (
                <button
                  className={`week-day ${day.date === selectedDay.date ? 'selected' : ''}`}
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                >
                  <strong>{day.label}</strong>
                  <span>{day.blocks.length} blocs</span>
                </button>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {view === 'ajouter' && (
        <section className="content-grid">
          <Panel title="Nouvelle tache">
            <form className="entry-form" onSubmit={createTask}>
              <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="Ex: 45 min anglais oral" required />
              <div className="form-grid">
                <select value={taskForm.category} onChange={(event) => setTaskForm({ ...taskForm, category: event.target.value })}>
                  <option value="formation">Formation</option>
                  <option value="anglais">Anglais</option>
                  <option value="freelance">Freelance</option>
                  <option value="sante">Sante</option>
                  <option value="travail">Travail</option>
                  <option value="general">General</option>
                </select>
                <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                  <option value="high">Priorite haute</option>
                  <option value="medium">Priorite moyenne</option>
                  <option value="low">Priorite basse</option>
                </select>
              </div>
              <div className="form-grid">
                <input type="number" min="15" step="15" value={taskForm.durationMinutes} onChange={(event) => setTaskForm({ ...taskForm, durationMinutes: event.target.value })} />
                <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} />
              </div>
              <button type="submit" disabled={busy}>Ajouter la tache</button>
            </form>
          </Panel>

          <Panel title="Nouvel horaire">
            <form className="entry-form" onSubmit={createEvent}>
              <input value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} placeholder="Ex: Travail prepose" required />
              <select value={eventForm.type} onChange={(event) => setEventForm({ ...eventForm, type: event.target.value })}>
                <option value="work">Travail</option>
                <option value="training">Formation</option>
                <option value="personal">Personnel</option>
              </select>
              <div className="form-grid">
                <input value={eventForm.employer} onChange={(event) => setEventForm({ ...eventForm, employer: event.target.value })} placeholder="Employeur" />
                <input value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} placeholder="Lieu" />
              </div>
              <div className="form-grid">
                <input value={eventForm.jobCategory} onChange={(event) => setEventForm({ ...eventForm, jobCategory: event.target.value })} placeholder="Categorie job" />
                <input value={eventForm.project} onChange={(event) => setEventForm({ ...eventForm, project: event.target.value })} placeholder="Projet" />
              </div>
              <div className="form-grid">
                <label>
                  <span>Debut</span>
                  <input type="datetime-local" value={eventForm.startAt} onChange={(event) => setEventForm({ ...eventForm, startAt: event.target.value })} required />
                </label>
                <label>
                  <span>Fin</span>
                  <input type="datetime-local" value={eventForm.endAt} onChange={(event) => setEventForm({ ...eventForm, endAt: event.target.value })} required />
                </label>
              </div>
              <button type="submit" disabled={busy}>Ajouter l'horaire</button>
            </form>
          </Panel>

          <Panel title="Nouvel objectif">
            <form className="entry-form" onSubmit={createGoal}>
              <input value={goalForm.title} onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })} placeholder="Ex: Reussir AZ-900" required />
              <div className="form-grid">
                <input value={goalForm.horizon} onChange={(event) => setGoalForm({ ...goalForm, horizon: event.target.value })} placeholder="Horizon" />
                <input value={goalForm.category} onChange={(event) => setGoalForm({ ...goalForm, category: event.target.value })} placeholder="Categorie" />
              </div>
              <button type="submit" disabled={busy}>Ajouter l'objectif</button>
            </form>
          </Panel>

          <Panel title="Nouvelle formation">
            <form className="entry-form" onSubmit={createTraining}>
              <input value={trainingForm.title} onChange={(event) => setTrainingForm({ ...trainingForm, title: event.target.value })} placeholder="Ex: Fortinet module 2" required />
              <input value={trainingForm.category} onChange={(event) => setTrainingForm({ ...trainingForm, category: event.target.value })} placeholder="Categorie" />
              <button type="submit" disabled={busy}>Ajouter la formation</button>
            </form>
          </Panel>
        </section>
      )}

      {view === 'taches' && (
        <section className="content-grid">
          <Panel title="Taches">
            <div className="task-list">
              {state.tasks.map((task) => (
              <article className={`task-row ${task.status === 'doing' ? 'running' : ''}`} key={task.id}>
                <button
                  className="check-button"
                  onClick={() => setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                  aria-label={task.status === 'done' ? 'Remettre a faire' : 'Terminer la tache'}
                >
                  {task.status === 'done' ? 'OK' : ''}
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.category} / prevu {task.durationMinutes} min / {task.priority}</small>
                  {task.activeStartedAt && <small className="running-text">En cours depuis {formatTime(task.activeStartedAt, state.profile.timezone)}</small>}
                  <div className="task-actions">
                    {task.status !== 'doing' && task.status !== 'done' && (
                      <button onClick={() => taskAction(task.id, 'start')} disabled={busy}>Demarrer</button>
                    )}
                    {task.status === 'doing' && (
                      <button onClick={() => taskAction(task.id, 'stop')} disabled={busy}>Arreter</button>
                    )}
                    {task.status !== 'done' && (
                      <button className="done-action" onClick={() => taskAction(task.id, 'finish')} disabled={busy}>Terminer</button>
                    )}
                    <button onClick={() => openTaskEditor(task)} disabled={busy}>Modifier</button>
                    <button className="danger-action" onClick={() => deleteTask(task.id)} disabled={busy}>Supprimer</button>
                  </div>
                  {editingTaskId === task.id && (
                    <form className="entry-form inline-editor" onSubmit={(event) => saveTaskEdit(event, task.id)}>
                      <input value={editTaskForm.title} onChange={(event) => setEditTaskForm({ ...editTaskForm, title: event.target.value })} required />
                      <div className="form-grid">
                        <select value={editTaskForm.category} onChange={(event) => setEditTaskForm({ ...editTaskForm, category: event.target.value })}>
                          <option value="formation">Formation</option>
                          <option value="anglais">Anglais</option>
                          <option value="freelance">Freelance</option>
                          <option value="sante">Sante</option>
                          <option value="travail">Travail</option>
                          <option value="general">General</option>
                        </select>
                        <select value={editTaskForm.priority} onChange={(event) => setEditTaskForm({ ...editTaskForm, priority: event.target.value })}>
                          <option value="high">Priorite haute</option>
                          <option value="medium">Priorite moyenne</option>
                          <option value="low">Priorite basse</option>
                        </select>
                      </div>
                      <div className="form-grid">
                        <input type="number" min="15" step="15" value={editTaskForm.durationMinutes} onChange={(event) => setEditTaskForm({ ...editTaskForm, durationMinutes: event.target.value })} />
                        <input type="date" value={editTaskForm.dueDate} onChange={(event) => setEditTaskForm({ ...editTaskForm, dueDate: event.target.value })} />
                      </div>
                      <div className="form-actions">
                        <button type="submit" disabled={busy}>Sauver</button>
                        <button type="button" className="secondary-action" onClick={() => setEditingTaskId(null)}>Annuler</button>
                      </div>
                    </form>
                  )}
                </div>
              </article>
              ))}
            </div>
          </Panel>

          <Panel title="Horaires de travail">
            <div className="filters">
              <select value={workFilters.employer} onChange={(event) => setWorkFilters({ ...workFilters, employer: event.target.value })}>
                <option value="">Tous les employeurs</option>
                {filterOptions.employers.map((employer) => <option key={employer} value={employer}>{employer}</option>)}
              </select>
              <select value={workFilters.category} onChange={(event) => setWorkFilters({ ...workFilters, category: event.target.value })}>
                <option value="">Toutes categories</option>
                {filterOptions.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={workFilters.location} onChange={(event) => setWorkFilters({ ...workFilters, location: event.target.value })}>
                <option value="">Tous les lieux</option>
                {filterOptions.locations.map((location) => <option key={location} value={location}>{location}</option>)}
              </select>
            </div>
            <div className="history-list">
              {filteredWorkEvents.length === 0 && <p className="muted">Aucun horaire pour ces filtres.</p>}
              {filteredWorkEvents.map((event) => (
                <article className="history-item accent-green" key={event.id}>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{formatDate(event.startAt, state.profile.timezone)} / {formatTime(event.startAt, state.profile.timezone)} - {formatTime(event.endAt, state.profile.timezone)}</span>
                    <span>{eventStatusLabel(event.status)}</span>
                    <span>{[event.employer, event.location, event.jobCategory].filter(Boolean).join(' / ') || 'Non classe'}</span>
                  </div>
                  <div>
                    <strong>{formatMinutes(eventDurationMinutes(event))}</strong>
                    <div className="task-actions">
                      <button className="danger-action" onClick={() => deleteEvent(event.id)} disabled={busy}>Supprimer</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {view === 'historique' && (
        <section className="content-grid">
          <Panel title="Historique semaine">
            <div className="history-summary">
              <article>
                <span>Semaine</span>
                <strong>{history.week.startDate} au {history.week.endDate}</strong>
              </article>
              <article>
                <span>Total effectue</span>
                <strong>{formatMinutes(history.totals.weekMinutes)}</strong>
              </article>
              <article>
                <span>Formations effectuees</span>
                <strong>{formatMinutes(history.totals.formationMinutesDone)}</strong>
              </article>
              <article>
                <span>Formations restantes</span>
                <strong>{formatMinutes(history.totals.formationMinutesRemaining)}</strong>
              </article>
              <article>
                <span>Travail effectue</span>
                <strong>{formatMinutes(history.workTotals.weekMinutes)}</strong>
              </article>
            </div>
          </Panel>

          <Panel title="Heures par employeur">
            <div className="history-list">
              {history.workTotals.byEmployer.length === 0 && <p className="muted">Aucune heure de travail cette semaine.</p>}
              {history.workTotals.byEmployer.map((item) => (
                <article className="history-item accent-green" key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{item.count} shift(s)</span>
                  <strong>{formatMinutes(item.minutes)}</strong>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Heures par categorie et lieu">
            <div className="history-list">
              {[...history.workTotals.byCategory, ...history.workTotals.byLocation].map((item) => (
                <article className="history-item" key={`${item.name}-${item.minutes}`}>
                  <strong>{item.name}</strong>
                  <span>{item.count} shift(s)</span>
                  <strong>{formatMinutes(item.minutes)}</strong>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Taches de la semaine">
            <div className="history-list">
              {history.tasks.map((task) => (
                <article className="history-item" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.category} / {task.status}</span>
                  </div>
                  <div className="hours-line">
                    <span>Prevu {formatMinutes(task.plannedMinutes)}</span>
                    <strong>Fait {formatMinutes(task.weekMinutes)}</strong>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Formations">
            <div className="history-list">
              {history.formations.length === 0 && <p className="muted">Aucune tache de formation cette semaine.</p>}
              {history.formations.map((task) => (
                <article className="history-item accent-blue" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.status}</span>
                  </div>
                  <div className="hours-line">
                    <span>Prevu {formatMinutes(task.plannedMinutes)}</span>
                    <strong>Fait {formatMinutes(task.weekMinutes)}</strong>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Historique des taches">
            <div className="history-list">
              {history.sessions.length === 0 && <p className="muted">Aucune session terminee cette semaine.</p>}
              {history.sessions.map((session) => (
                <article className="history-item" key={session.id}>
                  <div>
                    <strong>{session.title}</strong>
                    <span>{session.date} / {session.start} - {session.end || 'en cours'} / {session.category}</span>
                  </div>
                  <div className="hours-line">
                    <span>{session.status}</span>
                    <strong>{formatMinutes(session.durationMinutes)}</strong>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {view === 'objectifs' && (
        <section className="content-grid">
          <Panel title="Objectifs">
            <div className="list">
              {state.goals.map((goal) => (
                <article className="list-item accent-green" key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>{goal.horizon} / {goal.category}</span>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Formations">
            <div className="list">
              {state.trainings.map((training) => (
                <article className="list-item accent-blue" key={training.id}>
                  <strong>{training.title}</strong>
                  <span>{training.category} / {training.status}</span>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Jobs">
            <div className="chips">
              {state.profile.roles.map((role) => <span key={role}>{role}</span>)}
            </div>
          </Panel>
        </section>
      )}

      {view === 'projet' && (
        <section className="content-grid">
          <Panel title="Projets">
            <div className="history-list">
              {state.projects.map((project) => (
                <article className="history-item accent-blue" key={project.id}>
                  <div>
                    <strong>{project.title}</strong>
                    <span>{project.employer} / {project.location} / {project.category}</span>
                  </div>
                  <strong>{project.status}</strong>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Employeurs">
            <div className="history-list">
              {state.workProfiles.map((profile) => (
                <article className="history-item" key={profile.id}>
                  <strong>{profile.employer}</strong>
                  <span>{profile.category}</span>
                  <span>{profile.locations.join(' / ')}</span>
                </article>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {view === 'chat' && (
        <Panel title="Assistant">
          <div className="chat-log">
            {state.messages.length === 0 && <div className="bubble assistant">Ecris une tache, un horaire, un objectif ou une formation.</div>}
            {state.messages.slice(-12).map((item) => (
              <div className={`bubble ${item.role}`} key={item.id}>{item.content}</div>
            ))}
            {busy && <div className="bubble assistant">Je traite ca...</div>}
          </div>
          <form className="composer" onSubmit={sendMessage}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ex: je travaille le 24 juin de 8 a 8" />
            <button type="submit" disabled={busy}>Envoyer</button>
          </form>
        </Panel>
      )}
    </main>
  );
}

function AuthScreen({ needsSetup, authForm, setAuthForm, authError, busy, onSubmit }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Gestaches</p>
        <h1>{needsSetup ? 'Creer le compte' : 'Connexion'}</h1>
        <p className="auth-copy">
          {needsSetup
            ? 'Cree le premier compte pour proteger ton application.'
            : 'Connecte-toi pour acceder a ton planning.'}
        </p>
        <form className="entry-form" onSubmit={onSubmit}>
          <input
            type="email"
            value={authForm.email}
            onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
            placeholder="Email"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={authForm.password}
            onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
            placeholder="Mot de passe"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            minLength="8"
            required
          />
          {authError && <p className="form-error">{authError}</p>}
          <button type="submit" disabled={busy}>{needsSetup ? 'Creer le compte' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  );
}

function ProfilePanel({
  mode,
  user,
  state,
  config,
  notice,
  busy,
  settingsForm,
  setSettingsForm,
  passwordForm,
  setPasswordForm,
  onClose,
  onEnableNotifications,
  onDownloadBackup,
  onSaveSettings,
  onChangePassword
}) {
  return (
    <section className="profile-panel">
      <div className="profile-panel-head">
        <div>
          <p className="eyebrow">{mode === 'profile' ? 'Mon profil' : 'Parametrage'}</p>
          <h2>{mode === 'profile' ? user?.email : 'Reglages de l application'}</h2>
        </div>
        <button className="close-button" onClick={onClose}>Fermer</button>
      </div>

      {mode === 'profile' && (
        <div className="profile-grid">
          <article>
            <span>Email</span>
            <strong>{user?.email}</strong>
          </article>
          <article>
            <span>Localisation</span>
            <strong>{state.profile.location}</strong>
          </article>
          <article>
            <span>Fuseau horaire</span>
            <strong>{state.profile.timezone}</strong>
          </article>
          <article>
            <span>Travail cible</span>
            <strong>{state.profile.weeklyWorkTargetHours} h/semaine</strong>
          </article>
        </div>
      )}

      {mode === 'settings' && (
        <div className="settings-stack">
          <div className="notification-card">
            <div>
              <strong>{config.hasPush ? 'Serveur pret' : 'Cles VAPID requises'}</strong>
              <span>{notice || `Rappel ${state.profile.reminderMinutesBefore} min avant, planning a ${state.profile.dailyPlanTime}.`}</span>
            </div>
            <button onClick={onEnableNotifications}>Activer</button>
          </div>

          <div className="notification-card">
            <div>
              <strong>Sauvegarde des donnees</strong>
              <span>Telecharger une copie avant une mise a jour.</span>
            </div>
            <button onClick={onDownloadBackup}>Telecharger</button>
          </div>

          <form className="settings-form" onSubmit={onSaveSettings}>
            <label>
              <span>Planning du matin</span>
              <input type="time" value={settingsForm.dailyPlanTime} onChange={(event) => setSettingsForm({ ...settingsForm, dailyPlanTime: event.target.value })} />
            </label>
            <label>
              <span>Rappel avant</span>
              <input type="number" min="5" max="180" step="5" value={settingsForm.reminderMinutesBefore} onChange={(event) => setSettingsForm({ ...settingsForm, reminderMinutesBefore: event.target.value })} />
            </label>
            <label>
              <span>Fuseau horaire</span>
              <select value={settingsForm.timezone} onChange={(event) => setSettingsForm({ ...settingsForm, timezone: event.target.value })}>
                <option value="America/Moncton">America/Moncton</option>
                <option value="America/Toronto">America/Toronto</option>
                <option value="America/Halifax">America/Halifax</option>
                <option value="America/New_York">America/New_York</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <button type="submit" disabled={busy}>Sauver</button>
          </form>

          <form className="settings-form account-form" onSubmit={onChangePassword}>
            <label>
              <span>Mot de passe actuel</span>
              <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required />
            </label>
            <label>
              <span>Nouveau mot de passe</span>
              <input type="password" minLength="8" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required />
            </label>
            <button type="submit" disabled={busy}>Changer</button>
          </form>

          <div className="settings-section">
            <div className="panel-head compact-head">
              <h2>Employeurs et lieux</h2>
            </div>
            <div className="history-list">
              {state.workProfiles.map((profile) => (
                <article className="history-item accent-green" key={profile.id}>
                  <div>
                    <strong>{profile.employer}</strong>
                    <span>{profile.category}</span>
                    <span>{(profile.locations || []).join(' / ')}</span>
                    {profile.project && <span>{profile.project}</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function formatMinutes(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours} h ${mins} min`;
  if (hours) return `${hours} h`;
  return `${mins} min`;
}

function formatDate(iso, timezone) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date(iso));
}

function formatTime(iso, timezone) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

function eventDurationMinutes(event) {
  return Math.max(0, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000));
}

function eventStatusLabel(status) {
  return {
    planned: 'Planifie',
    doing: 'En cours',
    done: 'Termine'
  }[status || 'planned'] || 'Planifie';
}

function dateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function weekStartDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return dateInputValue(date);
}

function dateInTimezone(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDaysClient(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateInputValue(date);
}

function monthWeeksFor(date, timezone) {
  const current = dateInTimezone(date, timezone);
  const [year, month] = current.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12));
  const lastDay = new Date(Date.UTC(year, month, 0, 12));
  const lastDate = dateInputValue(lastDay);
  const weeks = [];
  let cursor = weekStartDate(dateInputValue(firstDay));

  while (cursor <= lastDate) {
    const endDate = addDaysClient(cursor, 6);
    weeks.push({
      startDate: cursor,
      endDate,
      label: `Semaine du ${cursor} au ${endDate}`
    });
    cursor = addDaysClient(cursor, 7);
  }

  return weeks;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function Block({ block }) {
  return (
    <article className={`time-block ${block.kind}`}>
      <time>{block.start} - {block.end}</time>
      <strong>{block.title}</strong>
      <span>{block.type} / {formatMinutes(eventDurationMinutes(block))}</span>
    </article>
  );
}

createRoot(document.getElementById('root')).render(<App />);
