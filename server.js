import express from 'express';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import webPush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Moncton';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');
const DIST_DIR = path.join(__dirname, 'dist');

const app = express();
app.use(express.json({ limit: '1mb' }));

const hasVapid = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (hasVapid) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function nowIso() {
  return new Date().toISOString();
}

function localDate(date = new Date(), timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function localTime(date = new Date(), timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function localLabel(dateString, timezone = APP_TIMEZONE) {
  const date = new Date(`${dateString}T12:00:00`);
  const label = new Intl.DateTimeFormat('fr-CA', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekStartDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((cookies, part) => {
    const [key, ...valueParts] = part.trim().split('=');
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const saved = Buffer.from(hash, 'hex');
  return saved.length === candidate.length && timingSafeEqual(saved, candidate);
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `gestaches_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

function expiredSessionCookie() {
  return 'gestaches_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}

function createSession(state, userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  state.auth.sessions = (state.auth.sessions || []).filter((session) => new Date(session.expiresAt) > new Date());
  state.auth.sessions.push({ token, userId, expiresAt, createdAt: nowIso() });
  return token;
}

function authenticatedUser(state, req) {
  const token = parseCookies(req).gestaches_session;
  if (!token) return null;
  const session = (state.auth.sessions || []).find((item) => item.token === token && new Date(item.expiresAt) > new Date());
  if (!session) return null;
  return (state.auth.users || []).find((user) => user.id === session.userId) || null;
}

function publicState(state) {
  const { auth, ...safeState } = state;
  return safeState;
}

function validTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function createGoal(title, horizon, category) {
  return {
    id: randomUUID(),
    title,
    horizon,
    category,
    status: 'active'
  };
}

function createTraining(title, category) {
  return {
    id: randomUUID(),
    title,
    category,
    status: 'in_progress'
  };
}

function createProject({ title, employer = '', location = '', category = 'general', status = 'active' }) {
  return {
    id: randomUUID(),
    title,
    employer,
    location,
    category,
    status
  };
}

function defaultWorkProfiles() {
  return [
    {
      id: 'danys',
      employer: "Dany's",
      locations: ["Dany's"],
      category: 'Housekeeping'
    },
    {
      id: 'residence-nepisiguit',
      employer: 'Residence Nepisiguit',
      locations: ['Laurier', 'Chaleur'],
      category: 'Prepose au beneficiaire'
    },
    {
      id: 'ksphereit-mentorat',
      employer: 'Travaille autonome KSPHEREIT',
      locations: ['En ligne'],
      category: 'Freelance IT',
      project: 'Mentorat administration reseau, securite et systeme'
    },
    {
      id: 'optimun-prestation',
      employer: 'Optimun Prestation',
      locations: ['En ligne'],
      category: 'Freelance IT'
    },
    {
      id: 'avaso-technology',
      employer: 'AVASO Technology',
      locations: ['Sur appel'],
      category: 'Freelance IT'
    }
  ];
}

function createTask({ title, category = 'general', durationMinutes = 45, priority = 'medium', dueDate = null, startAt = null }) {
  return {
    id: randomUUID(),
    title,
    category,
    durationMinutes: Math.max(15, Number(durationMinutes) || 45),
    priority,
    dueDate,
    startAt,
    status: 'todo',
    activeStartedAt: null,
    timeEntries: [],
    createdAt: nowIso()
  };
}

function createEvent({ title, type = 'work', startAt, endAt, source = 'manual', employer = '', location = '', jobCategory = '', project = '', status = 'planned', actualStartedAt = null, actualEndedAt = null }) {
  return {
    id: randomUUID(),
    title,
    type,
    startAt,
    endAt,
    employer,
    location,
    jobCategory,
    project,
    source,
    status,
    actualStartedAt,
    actualEndedAt
  };
}

function defaultState() {
  const today = localDate();
  return {
    profile: {
      name: 'Utilisateur',
      location: 'Petit-Rocher, Region Chaleur, NB, Canada',
      timezone: APP_TIMEZONE,
      weeklyWorkTargetHours: 50,
      dailyPlanTime: '06:30',
      reminderMinutesBefore: 30,
      roles: [
        'Prepose au beneficiaire',
        'Housekeeping certains soirs',
        'Coach',
        'Freelance developpement'
      ]
    },
    workProfiles: defaultWorkProfiles(),
    projects: [
      {
        id: 'mentorat-admin-reseau',
        title: 'Mentorat administration reseau, securite et systeme',
        employer: 'Travaille autonome KSPHEREIT',
        location: 'En ligne',
        category: 'Freelance IT',
        status: 'active'
      },
      {
        id: 'optimun-projets',
        title: 'Projets Optimun Prestation',
        employer: 'Optimun Prestation',
        location: 'En ligne',
        category: 'Freelance IT',
        status: 'active'
      },
      {
        id: 'avaso-sur-appel',
        title: 'Interventions AVASO Technology',
        employer: 'AVASO Technology',
        location: 'Sur appel',
        category: 'Freelance IT',
        status: 'on_call'
      }
    ],
    goals: [
      createGoal('Renouveler la certification AWS Cloud Practitioner', 'court terme', 'aws'),
      createGoal('Passer la certification AWS Solutions Architect', 'court/moyen terme', 'aws'),
      createGoal('Obtenir la certification AZ-900', 'court terme', 'azure'),
      createGoal('Ameliorer mon niveau d anglais', 'continu', 'anglais'),
      createGoal('Travailler en IT en janvier ou fevrier 2027 comme admin systeme reseau ou ingenieur cloud', 'janvier/fevrier 2027', 'carriere')
    ],
    trainings: [
      createTraining('Preparation certification hygiene pour le job de prepose', 'hygiene'),
      createTraining('AWS Solutions Architect', 'aws'),
      createTraining('Windows Server', 'systeme'),
      createTraining('Fortinet', 'reseau')
    ],
    tasks: [
      createTask({ title: 'Planifier 4 blocs AWS Solutions Architect cette semaine', category: 'formation', durationMinutes: 90, priority: 'high', dueDate: addDays(today, 2) }),
      createTask({ title: 'Faire 30 minutes de pratique anglais', category: 'anglais', durationMinutes: 30, priority: 'medium', dueDate: today }),
      createTask({ title: 'Faire une seance de sport courte', category: 'sante', durationMinutes: 35, priority: 'medium', dueDate: addDays(today, 1) }),
      createTask({ title: 'Lister les projets freelance actifs et la prochaine action de chacun', category: 'freelance', durationMinutes: 45, priority: 'high', dueDate: addDays(today, 1) })
    ],
    events: [],
    messages: [],
    pushSubscriptions: [],
    notificationLog: {},
    auth: {
      users: [],
      sessions: []
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function normalizeState(raw) {
  const base = defaultState();
  const state = { ...base, ...raw };
  state.profile = { ...base.profile, ...(raw.profile || {}) };
  state.profile.weeklyWorkTargetHours = raw.profile?.weeklyWorkTargetHours || raw.profile?.weekly_work_target_hours || base.profile.weeklyWorkTargetHours;
  state.workProfiles = Array.isArray(raw.workProfiles) ? raw.workProfiles : base.workProfiles;
  state.projects = Array.isArray(raw.projects) ? raw.projects : base.projects;
  state.goals = Array.isArray(raw.goals) ? raw.goals : base.goals;
  state.trainings = Array.isArray(raw.trainings) ? raw.trainings : base.trainings;
  state.tasks = Array.isArray(raw.tasks) ? raw.tasks.map((task) => ({
    id: task.id || randomUUID(),
    title: task.title,
    category: task.category || 'general',
    durationMinutes: task.durationMinutes || task.duration_minutes || 45,
    priority: task.priority || 'medium',
    dueDate: task.dueDate || task.due_date || null,
    startAt: task.startAt || task.start_at || null,
    status: task.status || 'todo',
    activeStartedAt: task.activeStartedAt || task.active_started_at || null,
    timeEntries: Array.isArray(task.timeEntries) ? task.timeEntries : [],
    createdAt: task.createdAt || task.created_at || nowIso()
  })) : base.tasks;
  state.events = Array.isArray(raw.events) ? raw.events.map((event) => ({
    id: event.id || randomUUID(),
    title: event.title,
    type: event.type || 'work',
    startAt: event.startAt || event.start || event.start_at,
    endAt: event.endAt || event.end || event.end_at,
    employer: event.employer || '',
    location: event.location || '',
    jobCategory: event.jobCategory || event.job_category || '',
    project: event.project || '',
    status: event.status || 'planned',
    actualStartedAt: event.actualStartedAt || event.actual_started_at || null,
    actualEndedAt: event.actualEndedAt || event.actual_ended_at || null,
    source: event.source || 'manual'
  })).filter((event) => event.startAt && event.endAt) : [];
  state.messages = Array.isArray(raw.messages) ? raw.messages : [];
  state.pushSubscriptions = Array.isArray(raw.pushSubscriptions) ? raw.pushSubscriptions : [];
  state.notificationLog = raw.notificationLog || {};
  state.auth = {
    users: Array.isArray(raw.auth?.users) ? raw.auth.users : [],
    sessions: Array.isArray(raw.auth?.sessions) ? raw.auth.sessions : []
  };
  return state;
}

async function loadState() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf8');
    return normalizeState(JSON.parse(content));
  } catch {
    const state = defaultState();
    await saveState(state);
    return state;
  }
}

async function saveState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  state.updatedAt = nowIso();
  await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2));
}

function priorityWeight(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 1;
}

function toDateTime(dateString, timeString, timezone = APP_TIMEZONE) {
  const offset = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    timeZoneName: 'longOffset'
  }).formatToParts(new Date(`${dateString}T12:00:00Z`)).find((part) => part.type === 'timeZoneName')?.value.replace('GMT', '') || '-03:00';
  return new Date(`${dateString}T${timeString}:00${offset}`);
}

function normalizeDateTimeInput(value, timezone = APP_TIMEZONE) {
  if (!value) return null;
  const raw = String(value);
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  return toDateTime(match[1], match[2], timezone).toISOString();
}

function eventToBlock(event, timezone = APP_TIMEZONE) {
  return {
    id: event.id,
    kind: 'event',
    title: event.title,
    type: event.type,
    employer: event.employer || '',
    location: event.location || '',
    jobCategory: event.jobCategory || '',
    project: event.project || '',
    status: event.status || 'planned',
    startAt: event.startAt,
    endAt: event.endAt,
    start: localTime(new Date(event.startAt), timezone),
    end: localTime(new Date(event.endAt), timezone)
  };
}

function freeWindowsForDay(dateString, events, timezone = APP_TIMEZONE) {
  const windows = [];
  let cursor = toDateTime(dateString, '06:30', timezone);
  const dayEnd = toDateTime(dateString, '22:30', timezone);
  const sorted = events
    .filter((event) => event.startAt?.slice(0, 10) === dateString)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  for (const event of sorted) {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (start > cursor) windows.push({ start: cursor, end: start });
    if (end > cursor) cursor = new Date(end.getTime() + 45 * 60 * 1000);
  }

  if (cursor < dayEnd) windows.push({ start: cursor, end: dayEnd });
  return windows;
}

function buildSchedule(state, days = 7, startDate = null) {
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const firstDate = startDate || weekStartDate(localDate(new Date(), timezone));
  const tasks = [...state.tasks]
    .filter((task) => task.status !== 'done')
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));

  let taskIndex = 0;
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(firstDate, index);
    const blocks = state.events
      .filter((event) => localDate(new Date(event.startAt), timezone) === date)
      .map((event) => eventToBlock(event, timezone));

    for (const window of freeWindowsForDay(date, state.events, timezone)) {
      let cursor = window.start;
      while (taskIndex < tasks.length) {
        const task = tasks[taskIndex];
        const duration = Math.max(15, Number(task.durationMinutes) || 45);
        const end = new Date(cursor.getTime() + duration * 60 * 1000);
        if (end > window.end) break;

        blocks.push({
          id: `${task.id}-${date}`,
          taskId: task.id,
          kind: 'task',
          title: task.title,
          type: task.category,
          priority: task.priority,
          status: task.status || 'todo',
          startAt: cursor.toISOString(),
          endAt: end.toISOString(),
          start: localTime(cursor, timezone),
          end: localTime(end, timezone)
        });
        cursor = new Date(end.getTime() + 10 * 60 * 1000);
        taskIndex += 1;
      }
    }

    blocks.sort((a, b) => a.start.localeCompare(b.start));
    return { date, label: localLabel(date, timezone), blocks };
  });
}

function addMessage(state, role, content) {
  state.messages.push({ id: randomUUID(), role, content, createdAt: nowIso() });
  state.messages = state.messages.slice(-80);
}

function closeTaskSession(task, endedAt = nowIso()) {
  if (!task.activeStartedAt) return null;
  const startedAt = task.activeStartedAt;
  const durationMinutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  const entry = {
    id: randomUUID(),
    startedAt,
    endedAt,
    durationMinutes
  };
  task.timeEntries = Array.isArray(task.timeEntries) ? task.timeEntries : [];
  task.timeEntries.push(entry);
  task.activeStartedAt = null;
  return entry;
}

function taskWorkedMinutes(task, includeActive = true) {
  const saved = (task.timeEntries || []).reduce((total, entry) => total + (Number(entry.durationMinutes) || 0), 0);
  if (!includeActive || !task.activeStartedAt) return saved;
  return saved + Math.max(0, Math.round((Date.now() - new Date(task.activeStartedAt).getTime()) / 60000));
}

function weekRange(timezone = APP_TIMEZONE) {
  const today = localDate(new Date(), timezone);
  const noon = new Date(`${today}T12:00:00`);
  const day = noon.getDay();
  const sundayOffset = -day;
  const start = new Date(noon);
  start.setDate(noon.getDate() + sundayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function entryIsInWeek(entry, range, timezone = APP_TIMEZONE) {
  const date = localDate(new Date(entry.endedAt || entry.startedAt), timezone);
  return date >= range.startDate && date <= range.endDate;
}

function buildHistory(state) {
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const range = weekRange(timezone);
  const tasks = state.tasks.map((task) => {
    const weeklyEntries = (task.timeEntries || []).filter((entry) => entryIsInWeek(entry, range, timezone));
    const weekMinutes = weeklyEntries.reduce((total, entry) => total + (Number(entry.durationMinutes) || 0), 0);
    const totalMinutes = taskWorkedMinutes(task);
    return {
      id: task.id,
      title: task.title,
      category: task.category,
      status: task.status,
      plannedMinutes: Number(task.durationMinutes) || 0,
      weekMinutes,
      totalMinutes,
      activeStartedAt: task.activeStartedAt,
      entries: weeklyEntries
    };
  });

  const sessions = state.tasks.flatMap((task) => (task.timeEntries || [])
    .filter((entry) => entryIsInWeek(entry, range, timezone))
    .map((entry) => ({
      id: entry.id,
      taskId: task.id,
      title: task.title,
      category: task.category,
      status: task.status,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationMinutes: Number(entry.durationMinutes) || 0,
      date: localDate(new Date(entry.endedAt || entry.startedAt), timezone),
      start: localTime(new Date(entry.startedAt), timezone),
      end: entry.endedAt ? localTime(new Date(entry.endedAt), timezone) : null
    })))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

  const formationTasks = tasks.filter((task) => task.category === 'formation');
  const formationMinutesDone = formationTasks.reduce((total, task) => total + task.weekMinutes, 0);
  const formationMinutesPlanned = formationTasks.reduce((total, task) => total + task.plannedMinutes, 0);
  const workEvents = state.events
    .filter((event) => event.type === 'work')
    .map((event) => ({
      ...event,
      date: localDate(new Date(event.startAt), timezone),
      start: localTime(new Date(event.startAt), timezone),
      end: localTime(new Date(event.endAt), timezone),
      durationMinutes: Math.max(0, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000))
    }))
    .filter((event) => event.date >= range.startDate && event.date <= range.endDate);

  const summarizeBy = (field) => Object.values(workEvents.reduce((acc, event) => {
    const key = event[field] || 'Non precise';
    if (!acc[key]) acc[key] = { name: key, minutes: 0, count: 0 };
    acc[key].minutes += event.durationMinutes;
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.minutes - a.minutes);

  return {
    week: range,
    totals: {
      weekMinutes: tasks.reduce((total, task) => total + task.weekMinutes, 0),
      formationMinutesDone,
      formationMinutesPlanned,
      formationMinutesRemaining: Math.max(0, formationMinutesPlanned - formationMinutesDone)
    },
    workTotals: {
      weekMinutes: workEvents.reduce((total, event) => total + event.durationMinutes, 0),
      byEmployer: summarizeBy('employer'),
      byLocation: summarizeBy('location'),
      byCategory: summarizeBy('jobCategory')
    },
    workEvents,
    tasks,
    formations: formationTasks,
    sessions
  };
}

function inferWorkProfile(message, state) {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const profiles = state.workProfiles || defaultWorkProfiles();
  const findProfile = (id) => profiles.find((profile) => profile.id === id) || {};

  if (normalized.includes('laurier')) {
    const profile = findProfile('residence-nepisiguit');
    return { employer: profile.employer, location: 'Laurier', jobCategory: profile.category, project: profile.project || '' };
  }
  if (normalized.includes('chaleur')) {
    const profile = findProfile('residence-nepisiguit');
    return { employer: profile.employer, location: 'Chaleur', jobCategory: profile.category, project: profile.project || '' };
  }
  if (normalized.includes('nepisiguit')) {
    const profile = findProfile('residence-nepisiguit');
    return { employer: profile.employer, location: '', jobCategory: profile.category, project: profile.project || '' };
  }
  if (normalized.includes('dany')) {
    const profile = findProfile('danys');
    return { employer: profile.employer, location: "Dany's", jobCategory: profile.category, project: profile.project || '' };
  }
  if (normalized.includes('ksphereit') || normalized.includes('mentorat') || normalized.includes('administration reseau')) {
    const profile = findProfile('ksphereit-mentorat');
    return { employer: profile.employer, location: 'En ligne', jobCategory: profile.category, project: profile.project || '' };
  }
  if (normalized.includes('optimun')) {
    const profile = findProfile('optimun-prestation');
    return { employer: profile.employer, location: 'En ligne', jobCategory: profile.category, project: profile.project || '' };
  }
  if (normalized.includes('avaso')) {
    const profile = findProfile('avaso-technology');
    return { employer: profile.employer, location: 'Sur appel', jobCategory: profile.category, project: profile.project || '' };
  }

  return { employer: '', location: '', jobCategory: '', project: '' };
}

function parseWorkEvent(message, state) {
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const months = {
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11,
    decembre: 12
  };
  const weekdays = {
    dimanche: 0,
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6
  };

  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!/(travaille|travail|shift|quart)/i.test(normalized)) return null;

  const relativeDate = normalized.includes('demain') ? 'demain' : (normalized.includes('aujourd') ? 'aujourd hui' : '');
  const dateMatch = normalized.match(/(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/i);
  const weekdayMatch = normalized.match(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/i);
  const timeMatch = normalized.match(/(?:de|entre)\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:a|-|jusqu'a)\s*(\d{1,2})(?:[:h](\d{2}))?/i)
    || normalized.match(/\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:a|-|jusqu'a)\s*(\d{1,2})(?:[:h](\d{2}))?\b/i);
  if ((!relativeDate && !dateMatch && !weekdayMatch) || !timeMatch) return null;

  const currentYear = Number(localDate(new Date(), timezone).slice(0, 4));
  let date;
  if (relativeDate) {
    date = localDate(new Date(), timezone);
    if (relativeDate === 'demain') date = addDays(date, 1);
  } else if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = months[dateMatch[2]];
    if (!month) return null;
    let year = dateMatch[3] ? Number(dateMatch[3]) : currentYear;
    date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!dateMatch[3] && date < addDays(localDate(new Date(), timezone), -2)) {
      year += 1;
      date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  } else {
    const targetDay = weekdays[weekdayMatch[1]];
    const todayDate = localDate(new Date(), timezone);
    const today = new Date(`${todayDate}T12:00:00`);
    const delta = (targetDay - today.getDay() + 7) % 7;
    const next = new Date(today);
    next.setDate(today.getDate() + delta);
    date = next.toISOString().slice(0, 10);
  }

  const startHour = Number(timeMatch[1]);
  const startMinute = Number(timeMatch[2] || 0);
  let endHour = Number(timeMatch[3]);
  const endMinute = Number(timeMatch[4] || 0);
  let endDate = date;
  if (endHour <= startHour) {
    if (startHour >= 12) {
      endDate = addDays(date, 1);
    } else {
      endHour += 12;
    }
  }

  const startAt = toDateTime(date, `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`, timezone).toISOString();
  const endAt = toDateTime(endDate, `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`, timezone).toISOString();
  const workProfile = inferWorkProfile(message, state);
  const titleParts = ['Travail', workProfile.employer, workProfile.location].filter(Boolean);
  return { title: titleParts.join(' - '), type: 'work', startAt, endAt, ...workProfile };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectChatAction(message) {
  const normalized = normalizeText(message);
  if (/\b(supprime|supprimer|efface|effacer|retire|retirer|annule|annuler)\b/.test(normalized)) return 'delete';
  if (/\b(modifie|modifier|change|changer|corrige|corriger|remplace|remplacer|deplace|deplacer)\b/.test(normalized)) return 'update';
  return '';
}

function isWorkCommand(message) {
  return /\b(shift|horaire|quart|travail|travaille)\b/.test(normalizeText(message));
}

function sameLocalTimeRange(event, parsedEvent, timezone) {
  return localTime(new Date(event.startAt), timezone) === localTime(new Date(parsedEvent.startAt), timezone)
    && localTime(new Date(event.endAt), timezone) === localTime(new Date(parsedEvent.endAt), timezone);
}

function scoreWorkEventTarget(event, message, parsedEvent, timezone) {
  const normalized = normalizeText(message);
  const eventDate = localDate(new Date(event.startAt), timezone);
  let score = 0;

  if (parsedEvent) {
    const parsedDate = localDate(new Date(parsedEvent.startAt), timezone);
    if (eventDate === parsedDate) score += 8;
    if (sameLocalTimeRange(event, parsedEvent, timezone)) score += 8;
    if (parsedEvent.employer && event.employer !== parsedEvent.employer) score += event.employer ? 1 : 3;
    if (parsedEvent.location && event.location !== parsedEvent.location) score += event.location ? 1 : 3;
  }

  for (const value of [event.title, event.employer, event.location, event.jobCategory, event.project]) {
    const token = normalizeText(value);
    if (token && normalized.includes(token)) score += 4;
  }

  return score;
}

function findWorkEventTarget(message, state, parsedEvent) {
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const candidates = state.events.filter((event) => event.type === 'work');
  if (!candidates.length) return null;

  const scored = candidates
    .map((event) => ({ event, score: scoreWorkEventTarget(event, message, parsedEvent, timezone) }))
    .sort((a, b) => b.score - a.score || String(b.event.startAt).localeCompare(String(a.event.startAt)));

  if (scored[0]?.score >= 8) return scored[0].event;
  return null;
}

function titleTokens(title) {
  const stopWords = new Set(['la', 'le', 'les', 'ma', 'mon', 'mes', 'une', 'un', 'de', 'du', 'des', 'a', 'en', 'pour', 'tache', 'formation', 'projet', 'modifier', 'modifie', 'supprimer', 'supprime']);
  return normalizeText(title).split(' ').filter((token) => token.length > 2 && !stopWords.has(token));
}

function scoreTextTarget(item, message) {
  const normalized = normalizeText(message);
  const title = normalizeText(item.title);
  if (!title) return 0;
  if (normalized.includes(title)) return 100;
  return titleTokens(item.title).reduce((score, token) => score + (normalized.includes(token) ? 1 : 0), 0);
}

function findTextTarget(items, message) {
  const scored = items
    .map((item) => ({ item, score: scoreTextTarget(item, message) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0]?.score >= 2 || (scored[0]?.score > 0 && (scored[1]?.score || 0) === 0)) return scored[0].item;
  return null;
}

function parseTaskUpdate(message, task) {
  const updates = {};
  const durationMatch = normalizeText(message).match(/\b(\d+)\s*(min|minute|minutes|h|heure|heures)\b/);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    updates.durationMinutes = durationMatch[2].startsWith('h') ? amount * 60 : amount;
  }

  const titleMatch = message.match(/\b(?:en|par|devient|titre)\s+(.+)$/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    if (title && normalizeText(title) !== normalizeText(task.title)) updates.title = title;
  }

  return updates;
}

function menuForChange(kind) {
  if (kind === 'shift') return 'Journee > Horaires, Taches > Horaires de travail et Historique';
  if (kind === 'task') return 'Taches et Historique';
  if (kind === 'training') return 'Objectifs > Formations';
  if (kind === 'project') return 'Projet';
  if (kind === 'goal') return 'Objectifs';
  return 'Dashboard';
}

function eventSummary(event, timezone = APP_TIMEZONE) {
  return `${event.title} le ${formatDateForReply(event.startAt, timezone)} de ${localTime(new Date(event.startAt), timezone)} a ${localTime(new Date(event.endAt), timezone)}`;
}

function formatDateForReply(iso, timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(iso));
}

function summarizeChanges(changes, fallback = '') {
  const details = changes.details || [];
  if (!details.length) return fallback || 'Je n ai rien modifie. Precise la tache ou le shift vise.';
  return details.map((detail) => {
    const action = detail.action === 'add' ? 'ajoute' : detail.action === 'update' ? 'modifie' : 'supprime';
    return `J ai ${action} ${detail.label}. Tu peux le voir dans: ${detail.menu}.`;
  }).join(' ');
}

function applyChatMutation(message, state) {
  const action = detectChatAction(message);
  if (!action) return null;

  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const changes = { tasks: 0, events: 0, goals: 0, trainings: 0, updated: 0, deleted: 0, details: [] };

  if (isWorkCommand(message)) {
    const parsedEvent = parseWorkEvent(message, state);
    const target = findWorkEventTarget(message, state, parsedEvent);
    if (!target) {
      return {
        handled: true,
        changes,
        reply: 'Je n ai pas trouve le shift a modifier ou supprimer. Precise la date et les heures, par exemple: supprime mon shift du vendredi 5 juin de 8 a 8.'
      };
    }

    if (action === 'delete') {
      const label = eventSummary(target, timezone);
      state.events = state.events.filter((event) => event.id !== target.id);
      changes.deleted += 1;
      changes.events += 1;
      changes.details.push({ action: 'delete', kind: 'shift', label: `le shift ${label}`, menu: menuForChange('shift') });
      return { handled: true, changes, reply: summarizeChanges(changes) };
    }

    if (!parsedEvent) {
      return {
        handled: true,
        changes,
        reply: 'J ai trouve le shift, mais je n ai pas assez d information pour le modifier. Donne la nouvelle date, les heures ou le lieu.'
      };
    }

    target.title = parsedEvent.title && parsedEvent.title !== 'Travail' ? parsedEvent.title : target.title;
    target.startAt = parsedEvent.startAt || target.startAt;
    target.endAt = parsedEvent.endAt || target.endAt;
    target.employer = parsedEvent.employer || target.employer || '';
    target.location = parsedEvent.location || target.location || '';
    target.jobCategory = parsedEvent.jobCategory || target.jobCategory || '';
    target.project = parsedEvent.project || target.project || '';
    changes.updated += 1;
    changes.events += 1;
    changes.details.push({ action: 'update', kind: 'shift', label: `le shift ${eventSummary(target, timezone)}`, menu: menuForChange('shift') });
    return { handled: true, changes, reply: summarizeChanges(changes) };
  }

  if (/\b(tache|task)\b/.test(normalizeText(message))) {
    const target = findTextTarget(state.tasks, message);
    if (!target) {
      return { handled: true, changes, reply: 'Je n ai pas trouve la tache visee. Donne quelques mots exacts du titre de la tache.' };
    }

    if (action === 'delete') {
      const label = target.title;
      state.tasks = state.tasks.filter((task) => task.id !== target.id);
      changes.deleted += 1;
      changes.tasks += 1;
      changes.details.push({ action: 'delete', kind: 'task', label: `la tache "${label}"`, menu: menuForChange('task') });
      return { handled: true, changes, reply: summarizeChanges(changes) };
    }

    const updates = parseTaskUpdate(message, target);
    if (updates.title) target.title = updates.title;
    if (updates.durationMinutes) target.durationMinutes = Math.max(15, Number(updates.durationMinutes) || target.durationMinutes);
    changes.updated += 1;
    changes.tasks += 1;
    changes.details.push({ action: 'update', kind: 'task', label: `la tache "${target.title}"`, menu: menuForChange('task') });
    return { handled: true, changes, reply: summarizeChanges(changes) };
  }

  return null;
}

function fallbackIntent(message, state) {
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const workEvent = parseWorkEvent(message, state);
  if (workEvent) {
    return {
      reply: 'Horaire ajoute. Si le jour de semaine mentionne ne correspond pas a la date, j ai garde la date precise.',
      tasks: [],
      events: [workEvent],
      goals: [],
      trainings: [],
      projects: []
    };
  }

  let category = 'general';
  if (/aws|azure|az-900|certification|formation/i.test(message)) category = 'formation';
  if (/anglais|english/i.test(message)) category = 'anglais';
  if (/sport|entrainement|gym/i.test(message)) category = 'sante';
  if (/freelance|projet|dev/i.test(message)) category = 'freelance';

  return {
    reply: 'Tache ajoutee. Configure OpenAI pour une interpretation plus fine des dates et priorites.',
    tasks: [{ title: message.trim(), category, durationMinutes: 45, priority: 'medium', dueDate: addDays(localDate(new Date(), timezone), 1) }],
    events: [],
    goals: [],
    trainings: [],
    projects: []
  };
}

async function openAiIntent(message, state) {
  if (!process.env.OPENAI_API_KEY) return null;
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const referenceDate = localDate(new Date(), timezone);
  const referenceTime = localTime(new Date(), timezone);
  const payload = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `Tu convertis un message en changements JSON pour une app de planification. Retourne uniquement du JSON valide. Reference absolue obligatoire: fuseau=${timezone}, date_locale=${referenceDate}, heure_locale=${referenceTime}. Ne devine jamais une autre date. "aujourd'hui" signifie strictement ${referenceDate} dans ce fuseau. "demain" signifie strictement le lendemain de ${referenceDate} dans ce fuseau. "cette semaine" suit dimanche a samedi dans ce fuseau. Schema: {"reply":"","tasks":[{"title":"","category":"formation|travail|sante|freelance|anglais|general","durationMinutes":45,"priority":"high|medium|low","dueDate":"YYYY-MM-DD","startAt":null}],"events":[{"title":"","type":"work|personal|training","startAt":"ISO","endAt":"ISO","employer":"","location":"","jobCategory":"","project":""}],"goals":[{"title":"","horizon":"","category":""}],"trainings":[{"title":"","category":""}],"projects":[{"title":"","employer":"","location":"","category":"","status":"active"}]}. Pour modifier ou supprimer, ne promets rien dans reply: le serveur fera l action seulement s il trouve l element. Catalogue travail: Dany's -> lieu Dany's, categorie Housekeeping. Residence Nepisiguit -> lieux Laurier et Chaleur, categorie Prepose au beneficiaire. Travaille autonome KSPHEREIT -> lieu En ligne, categorie Freelance IT, projet Mentorat administration reseau securite et systeme. Optimun Prestation -> lieu En ligne, categorie Freelance IT. AVASO Technology -> lieu Sur appel, categorie Freelance IT. Interprete "8 a 8" comme 08:00 a 20:00 et "8 a 4" comme 08:00 a 16:00 pour un travail de jour. Si date et jour de semaine se contredisent, privilegie la date precise et mentionne-le dans reply.`
      },
      {
        role: 'user',
        content: JSON.stringify({
          profile: state.profile,
          workProfiles: state.workProfiles,
          goals: state.goals,
          trainings: state.trainings,
          message
        })
      }
    ]
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    const data = await response.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch {
    return null;
  }
}

function applyIntent(state, intent) {
  const changes = { tasks: 0, events: 0, goals: 0, trainings: 0, projects: 0, updated: 0, deleted: 0, details: [] };
  for (const task of intent.tasks || []) {
    if (!task.title) continue;
    const created = createTask(task);
    state.tasks.push(created);
    changes.tasks += 1;
    changes.details.push({ action: 'add', kind: 'task', label: `la tache "${created.title}"`, menu: menuForChange('task') });
  }
  for (const event of intent.events || []) {
    if (!event.title || !event.startAt || !event.endAt) continue;
    const created = createEvent(event);
    state.events.push(created);
    changes.events += 1;
    changes.details.push({ action: 'add', kind: 'shift', label: `le shift ${eventSummary(created, state.profile?.timezone || APP_TIMEZONE)}`, menu: menuForChange('shift') });
  }
  for (const goal of intent.goals || []) {
    if (!goal.title) continue;
    const created = createGoal(goal.title, goal.horizon || 'court terme', goal.category || 'general');
    state.goals.push(created);
    changes.goals += 1;
    changes.details.push({ action: 'add', kind: 'goal', label: `l objectif "${created.title}"`, menu: menuForChange('goal') });
  }
  for (const training of intent.trainings || []) {
    if (!training.title) continue;
    const created = createTraining(training.title, training.category || 'formation');
    state.trainings.push(created);
    changes.trainings += 1;
    changes.details.push({ action: 'add', kind: 'training', label: `la formation "${created.title}"`, menu: menuForChange('training') });
  }
  for (const project of intent.projects || []) {
    if (!project.title) continue;
    const created = createProject(project);
    state.projects.push(created);
    changes.projects += 1;
    changes.details.push({ action: 'add', kind: 'project', label: `le projet "${created.title}"`, menu: menuForChange('project') });
  }
  return changes;
}

function responsePayload(state, options = {}) {
  return {
    state: publicState(state),
    schedule: buildSchedule(state, 7, options.weekStart || null),
    history: buildHistory(state),
    config: {
      hasAi: Boolean(process.env.OPENAI_API_KEY),
      hasPush: hasVapid,
      publicVapidKey: process.env.VAPID_PUBLIC_KEY || ''
    }
  };
}

async function sendPush(subscription, payload) {
  if (!hasVapid) return false;
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

async function notifyAll(state, payload) {
  const results = await Promise.all(state.pushSubscriptions.map((subscription) => sendPush(subscription, payload)));
  return results.filter(Boolean).length;
}

function minutesUntil(iso) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

function blockDurationMinutes(block) {
  return Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000));
}

function actionPayloadForBlock(block, kind = 'reminder') {
  const isTask = block.kind === 'task' && block.taskId;
  const isEvent = block.kind === 'event';
  const basePath = isTask ? `/api/tasks/${block.taskId}` : isEvent ? `/api/events/${block.id}` : '';
  const actionUrls = basePath
    ? {
        start: `${basePath}/start`,
        finish: `${basePath}/finish`
      }
    : {};
  const actions = basePath
    ? [
        { action: 'start', title: 'Je commence' },
        { action: 'finish', title: 'Termine' }
      ]
    : [];

  return {
    url: '/',
    tag: `${kind}-${block.id}-${block.startAt}`,
    actions,
    actionUrls
  };
}

async function runNotificationTick() {
  const state = await loadState();
  if (!state.pushSubscriptions.length || !hasVapid) return;

  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const today = localDate(new Date(), timezone);
  const currentTime = localTime(new Date(), timezone);
  const dailyKey = `daily-${today}`;
  if (currentTime === state.profile.dailyPlanTime && !state.notificationLog[dailyKey]) {
    const todayBlocks = buildSchedule(state, 1, today)[0].blocks;
    const body = todayBlocks.length
      ? todayBlocks.slice(0, 5).map((block) => `${block.start} ${block.title}`).join(' | ')
      : 'Aucun bloc planifie aujourd hui.';
    await notifyAll(state, { title: 'Planning du jour', body, url: '/' });
    state.notificationLog[dailyKey] = nowIso();
  }

  const upcomingBlocks = buildSchedule(state, 7, today).flatMap((day) => day.blocks);
  for (const block of upcomingBlocks) {
    if (block.status === 'done') continue;
    const startDelta = minutesUntil(block.startAt);
    const beforeStartKey = `before-start-${block.id}-${block.startAt}`;
    if (startDelta <= state.profile.reminderMinutesBefore && startDelta >= state.profile.reminderMinutesBefore - 2 && !state.notificationLog[beforeStartKey]) {
      await notifyAll(state, {
        title: `Dans ${state.profile.reminderMinutesBefore} min`,
        body: `${block.start} - ${block.title} (${blockDurationMinutes(block)} min)`,
        ...actionPayloadForBlock(block, 'before-start')
      });
      state.notificationLog[beforeStartKey] = nowIso();
    }

    const startKey = `validate-start-${block.id}-${block.startAt}`;
    if (startDelta <= 1 && startDelta >= -4 && !state.notificationLog[startKey]) {
      await notifyAll(state, {
        title: 'Validation',
        body: `Est-ce que tu commences maintenant: ${block.title} ?`,
        ...actionPayloadForBlock(block, 'start')
      });
      state.notificationLog[startKey] = nowIso();
    }

    const endDelta = minutesUntil(block.endAt);
    const beforeEndKey = `before-end-${block.id}-${block.endAt}`;
    if (endDelta <= state.profile.reminderMinutesBefore && endDelta >= state.profile.reminderMinutesBefore - 2 && !state.notificationLog[beforeEndKey]) {
      await notifyAll(state, {
        title: `Fin dans ${state.profile.reminderMinutesBefore} min`,
        body: `${block.end} - ${block.title}`,
        ...actionPayloadForBlock(block, 'before-end')
      });
      state.notificationLog[beforeEndKey] = nowIso();
    }

    const activeCheckSlot = Math.floor(Date.now() / (30 * 60 * 1000));
    const activeCheckKey = `active-check-${block.id}-${activeCheckSlot}`;
    if (startDelta < -4 && endDelta > 1 && !state.notificationLog[activeCheckKey]) {
      await notifyAll(state, {
        title: 'Toujours en cours ?',
        body: block.status === 'doing'
          ? `Tu es toujours sur: ${block.title} ?`
          : `Est-ce que tu as commence: ${block.title} ?`,
        ...actionPayloadForBlock(block, 'active-check')
      });
      state.notificationLog[activeCheckKey] = nowIso();
    }

    const endKey = `validate-end-${block.id}-${block.endAt}`;
    if (endDelta <= 1 && endDelta >= -4 && !state.notificationLog[endKey]) {
      await notifyAll(state, {
        title: 'Validation',
        body: `Est-ce que tu as termine: ${block.title} ?`,
        ...actionPayloadForBlock(block, 'end')
      });
      state.notificationLog[endKey] = nowIso();
    }

    const overdueCheckSlot = Math.floor(Date.now() / (30 * 60 * 1000));
    const overdueCheckKey = `overdue-check-${block.id}-${overdueCheckSlot}`;
    if (endDelta < -4 && !state.notificationLog[overdueCheckKey]) {
      await notifyAll(state, {
        title: 'Validation requise',
        body: `As-tu termine: ${block.title} ?`,
        ...actionPayloadForBlock(block, 'overdue-check')
      });
      state.notificationLog[overdueCheckKey] = nowIso();
    }
  }

  await saveState(state);
}

app.get('/api/auth/status', async (req, res) => {
  const state = await loadState();
  const user = authenticatedUser(state, req);
  res.json({
    authenticated: Boolean(user),
    needsSetup: (state.auth.users || []).length === 0,
    user: user ? { id: user.id, email: user.email } : null
  });
});

app.post('/api/auth/register', async (req, res) => {
  const state = await loadState();
  if ((state.auth.users || []).length > 0) return res.status(409).json({ error: 'Compte deja cree' });

  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: 'Email invalide' });
  if (password.length < 8) return res.status(422).json({ error: 'Mot de passe trop court' });

  const user = { id: randomUUID(), email, passwordHash: hashPassword(password), createdAt: nowIso() };
  state.auth.users.push(user);
  const token = createSession(state, user.id);
  await saveState(state);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.json({ authenticated: true, user: { id: user.id, email: user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const state = await loadState();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = (state.auth.users || []).find((item) => item.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Identifiants invalides' });

  const token = createSession(state, user.id);
  await saveState(state);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.json({ authenticated: true, user: { id: user.id, email: user.email } });
});

app.post('/api/auth/logout', async (req, res) => {
  const state = await loadState();
  const token = parseCookies(req).gestaches_session;
  state.auth.sessions = (state.auth.sessions || []).filter((session) => session.token !== token);
  await saveState(state);
  res.setHeader('Set-Cookie', expiredSessionCookie());
  res.json({ authenticated: false });
});

app.use('/api', async (req, res, next) => {
  const state = await loadState();
  if ((state.auth.users || []).length === 0) return res.status(401).json({ error: 'Configuration requise', needsSetup: true });
  const user = authenticatedUser(state, req);
  if (!user) return res.status(401).json({ error: 'Authentification requise', needsSetup: false });
  req.currentUser = user;
  next();
});

app.get('/api/state', async (req, res) => {
  const state = await loadState();
  const weekStart = typeof req.query.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.weekStart)
    ? req.query.weekStart
    : null;
  res.json(responsePayload(state, { weekStart }));
});

app.post('/api/chat', async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(422).json({ error: 'Message vide' });

  const state = await loadState();
  addMessage(state, 'user', message);
  const mutation = applyChatMutation(message, state);
  let changes;
  let reply;

  if (mutation?.handled) {
    changes = mutation.changes;
    reply = mutation.reply;
  } else {
    const localWorkEvent = parseWorkEvent(message, state);
    const intent = localWorkEvent
      ? {
          reply: '',
          tasks: [],
          events: [localWorkEvent],
          goals: [],
          trainings: [],
          projects: []
        }
      : await openAiIntent(message, state) || fallbackIntent(message, state);
    const inferredWorkProfile = inferWorkProfile(message, state);
    intent.events = (intent.events || []).map((event) => event.type === 'work' ? {
      ...event,
      employer: event.employer || inferredWorkProfile.employer || '',
      location: event.location || inferredWorkProfile.location || '',
      jobCategory: event.jobCategory || inferredWorkProfile.jobCategory || '',
      project: event.project || inferredWorkProfile.project || ''
    } : event);
    changes = applyIntent(state, intent);
    reply = summarizeChanges(changes, intent.reply);
  }

  addMessage(state, 'assistant', reply);
  await saveState(state);

  res.json({
    reply,
    changes,
    ...responsePayload(state)
  });
});

app.post('/api/tasks/:id/status', async (req, res) => {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tache introuvable' });
  const nextStatus = ['todo', 'doing', 'done'].includes(req.body.status) ? req.body.status : 'todo';
  if (nextStatus === 'done') closeTaskSession(task);
  if (nextStatus !== 'doing' && nextStatus !== 'done') task.activeStartedAt = null;
  task.status = nextStatus;
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/tasks/:id/start', async (req, res) => {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tache introuvable' });

  for (const otherTask of state.tasks) {
    if (otherTask.id !== task.id && otherTask.activeStartedAt) {
      closeTaskSession(otherTask);
      if (otherTask.status === 'doing') otherTask.status = 'todo';
    }
  }

  task.status = 'doing';
  task.activeStartedAt = task.activeStartedAt || nowIso();
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/tasks/:id/stop', async (req, res) => {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tache introuvable' });

  closeTaskSession(task);
  if (task.status === 'doing') task.status = 'todo';
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/tasks/:id/finish', async (req, res) => {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tache introuvable' });

  closeTaskSession(task);
  task.status = 'done';
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/tasks', async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(422).json({ error: 'Titre requis' });

  const state = await loadState();
  state.tasks.push(createTask({
    title,
    category: req.body.category || 'general',
    durationMinutes: req.body.durationMinutes || 45,
    priority: req.body.priority || 'medium',
    dueDate: req.body.dueDate || null,
    startAt: normalizeDateTimeInput(req.body.startAt, state.profile?.timezone || APP_TIMEZONE)
  }));
  await saveState(state);
  res.json(responsePayload(state));
});

app.put('/api/tasks/:id', async (req, res) => {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tache introuvable' });

  const title = String(req.body.title || '').trim();
  if (!title) return res.status(422).json({ error: 'Titre requis' });

  task.title = title;
  task.category = req.body.category || task.category || 'general';
  task.durationMinutes = Math.max(15, Number(req.body.durationMinutes) || task.durationMinutes || 45);
  task.priority = req.body.priority || task.priority || 'medium';
  task.dueDate = req.body.dueDate || null;
  await saveState(state);
  res.json(responsePayload(state));
});

app.delete('/api/tasks/:id', async (req, res) => {
  const state = await loadState();
  const index = state.tasks.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Tache introuvable' });

  state.tasks.splice(index, 1);
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/events', async (req, res) => {
  const title = String(req.body.title || '').trim();
  const state = await loadState();
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const startAt = normalizeDateTimeInput(req.body.startAt, timezone);
  const endAt = normalizeDateTimeInput(req.body.endAt, timezone);
  if (!title || !startAt || !endAt) return res.status(422).json({ error: 'Titre, debut et fin requis' });
  if (new Date(endAt) <= new Date(startAt)) return res.status(422).json({ error: 'La fin doit etre apres le debut' });

  state.events.push(createEvent({
    title,
    type: req.body.type || 'work',
    startAt,
    endAt,
    employer: req.body.employer || '',
    location: req.body.location || '',
    jobCategory: req.body.jobCategory || '',
    project: req.body.project || '',
    source: 'manual'
  }));
  await saveState(state);
  res.json(responsePayload(state));
});

app.put('/api/events/:id', async (req, res) => {
  const state = await loadState();
  const event = state.events.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Horaire introuvable' });

  const title = String(req.body.title || event.title || '').trim();
  const timezone = state.profile?.timezone || APP_TIMEZONE;
  const startAt = req.body.startAt ? normalizeDateTimeInput(req.body.startAt, timezone) : event.startAt;
  const endAt = req.body.endAt ? normalizeDateTimeInput(req.body.endAt, timezone) : event.endAt;
  if (!title || !startAt || !endAt) return res.status(422).json({ error: 'Titre, debut et fin requis' });
  if (new Date(endAt) <= new Date(startAt)) return res.status(422).json({ error: 'La fin doit etre apres le debut' });

  event.title = title;
  event.type = req.body.type || event.type || 'work';
  event.startAt = startAt;
  event.endAt = endAt;
  event.employer = req.body.employer ?? event.employer ?? '';
  event.location = req.body.location ?? event.location ?? '';
  event.jobCategory = req.body.jobCategory ?? event.jobCategory ?? '';
  event.project = req.body.project ?? event.project ?? '';
  await saveState(state);
  res.json(responsePayload(state));
});

app.delete('/api/events/:id', async (req, res) => {
  const state = await loadState();
  const index = state.events.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Horaire introuvable' });

  state.events.splice(index, 1);
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/events/:id/start', async (req, res) => {
  const state = await loadState();
  const event = state.events.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Horaire introuvable' });

  event.status = 'doing';
  event.actualStartedAt = event.actualStartedAt || nowIso();
  event.actualEndedAt = null;
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/events/:id/finish', async (req, res) => {
  const state = await loadState();
  const event = state.events.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Horaire introuvable' });

  event.status = 'done';
  event.actualStartedAt = event.actualStartedAt || event.startAt || nowIso();
  event.actualEndedAt = nowIso();
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/goals', async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(422).json({ error: 'Titre requis' });

  const state = await loadState();
  state.goals.push(createGoal(title, req.body.horizon || 'court terme', req.body.category || 'general'));
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/trainings', async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(422).json({ error: 'Titre requis' });

  const state = await loadState();
  state.trainings.push(createTraining(title, req.body.category || 'formation'));
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/settings', async (req, res) => {
  const state = await loadState();
  const dailyPlanTime = String(req.body.dailyPlanTime || state.profile.dailyPlanTime);
  const reminderMinutesBefore = Number(req.body.reminderMinutesBefore || state.profile.reminderMinutesBefore);
  const timezone = String(req.body.timezone || state.profile.timezone || APP_TIMEZONE);

  if (!/^\d{2}:\d{2}$/.test(dailyPlanTime)) return res.status(422).json({ error: 'Heure invalide' });
  if (!validTimezone(timezone)) return res.status(422).json({ error: 'Fuseau horaire invalide' });
  state.profile.dailyPlanTime = dailyPlanTime;
  state.profile.reminderMinutesBefore = Math.min(180, Math.max(5, reminderMinutesBefore));
  state.profile.timezone = timezone;
  await saveState(state);
  res.json(responsePayload(state));
});

app.post('/api/account/password', async (req, res) => {
  const state = await loadState();
  const user = (state.auth.users || []).find((item) => item.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });

  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!verifyPassword(currentPassword, user.passwordHash)) return res.status(401).json({ error: 'Mot de passe actuel invalide' });
  if (newPassword.length < 8) return res.status(422).json({ error: 'Nouveau mot de passe trop court' });

  user.passwordHash = hashPassword(newPassword);
  state.auth.sessions = (state.auth.sessions || []).filter((session) => session.userId !== user.id);
  const token = createSession(state, user.id);
  await saveState(state);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.json({ ok: true });
});

app.post('/api/push/subscribe', async (req, res) => {
  const subscription = req.body.subscription;
  if (!subscription?.endpoint) return res.status(422).json({ error: 'Abonnement invalide' });
  const state = await loadState();
  state.pushSubscriptions = state.pushSubscriptions.filter((item) => item.endpoint !== subscription.endpoint);
  state.pushSubscriptions.push(subscription);
  await saveState(state);
  res.json({ ok: true, hasPush: hasVapid });
});

app.post('/api/push/test', async (req, res) => {
  const state = await loadState();
  const sent = await notifyAll(state, {
    title: 'Gestaches',
    body: 'Notifications activees pour tes rappels.',
    url: '/'
  });
  res.json({ sent });
});

app.use(express.static(DIST_DIR));
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gestaches running on port ${PORT}`);
});

setInterval(() => {
  runNotificationTick().catch(() => {});
}, 60 * 1000);
