import { auth, authReady, db } from './firebase-config.js';
import { authenticatedFetch } from './api.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { renderMarkdown } from './markdown.js';
import { formatProgramMarkdown } from './goal-format.js';

const modal = document.querySelector('#goalModal');
const form = document.querySelector('#goalForm');
const fields = document.querySelector('#goalFields');
const saveGoal = document.querySelector('#saveGoal');
const errorBox = document.querySelector('#goalError');
const messages = document.querySelector('#messages');
const welcome = document.querySelector('#welcome');
const input = document.querySelector('#messageInput');
const send = document.querySelector('#sendBtn');
const goalDashboard = document.querySelector('#goalDashboard');
const goalDashboardDetails = document.querySelector('#goalDashboardDetails');
const goalTaskPlan = document.querySelector('#goalTaskPlan');
let currentUser = null, goal = null, selectedType = '', conversationId = null;
let activeQuiz = '';
const goalRef = () => doc(db, 'users', currentUser.uid, 'goals', 'default');
const goalConversations = () => collection(db, 'users', currentUser.uid, 'goals', 'default', 'conversations');

const options = (values, placeholder = 'Choisir…') => `<option value="">${placeholder}</option>${values.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}`;
function goalDescription(value = goal) {
  if (!value) return '';
  if (value.type === 'exam') return `${value.goalTitle ? `${value.goalTitle} · ` : ''}${value.chapters.length} chapitre${value.chapters.length > 1 ? 's' : ''} · ${value.duration.value} jours`;
  const durationLabel = value.duration.unit === 'days' ? 'jours' : value.duration.unit === 'weeks' ? 'semaines' : 'mois';
  return `${value.goalTitle ? `${value.goalTitle} · ` : ''}${value.language} · ${value.level}${value.targetLevel ? ` → ${value.targetLevel}` : ''} · ${value.duration.value} ${durationLabel}`;
}
function updateComposer() { send.disabled = !input.value.trim(); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; }
function showError(message = '') { errorBox.textContent = message; errorBox.hidden = !message; }
function selectDifficulty(button) { button.parentElement.querySelectorAll('button').forEach(item => item.classList.toggle('selected', item === button)); button.parentElement.dataset.value = button.dataset.value; validateForm(); }
function chapterFields(count = 1) { return Array.from({ length: count }, (_, index) => `<article class="chapter-card"><b>Chapitre ${index + 1}</b><label>Nom du chapitre<input class="chapter-name" maxlength="100" required placeholder="Ex. Algèbre"></label><label>Difficulté</label><div class="level-choice chapter-difficulty" data-value=""><button type="button" data-value="easy">Facile</button><button type="button" data-value="medium">Moyen</button><button type="button" data-value="hard">Difficile</button></div></article>`).join(''); }
function commonGoalFields() { return `<div class="goal-fields"><label>But précis<input id="goalTitleInput" maxlength="160" required placeholder="Ex. Réussir mon examen de programmation"></label><label>Description<textarea id="goalDescriptionInput" maxlength="2000" rows="3" placeholder="Décris ce que tu sais déjà, tes difficultés et ce que tu veux travailler."></textarea></label><label>Autres détails ou préférences<textarea id="goalDetailsInput" maxlength="1000" rows="2" placeholder="Ex. Je préfère surtout m’entraîner avec des exercices."></textarea></label></div>`; }
function renderFields() {
  if (!selectedType) { fields.innerHTML = ''; validateForm(); return; }
  const common = commonGoalFields();
  if (selectedType === 'exam') fields.innerHTML = `${common}<div class="goal-fields"><label>Niveau actuel (facultatif)<input id="level" maxlength="100" placeholder="Ex. Terminale, niveau intermédiaire"></label><label>Nombre de chapitres<select id="chapterCount">${options([1,2,3,4,5,6].map(value => [value, value]), 'Choisir de 1 à 6')}</select></label><div id="chapters"></div><label>Durée de préparation<div class="duration-row"><input id="duration" type="number" min="3" max="30" inputmode="numeric" placeholder="Entre 3 et 30"><span>jours</span></div></label></div>`;
  if (selectedType === 'programming') fields.innerHTML = `${common}<div class="goal-fields"><label>Langage<select id="language">${options([['C','C'],['Python','Python'],['Pseudo-code','Pseudo-code']])}</select></label><label>Niveau actuel<select id="level">${options([['beginner','Débutant'],['intermediate','Intermédiaire'],['advanced','Avancé']])}</select></label><label>Durée de l’objectif<div class="duration-row"><input id="duration" type="number" min="3" max="90" inputmode="numeric" placeholder="3 à 90"><span>jours</span></div></label></div>`;
  if (selectedType === 'language') fields.innerHTML = `${common}<div class="goal-fields"><label>Langue à apprendre<select id="language">${options([['Français','Français'],['Anglais','Anglais'],['Espagnol','Espagnol']])}</select></label><label>Niveau actuel<select id="level">${options([['A1','A1'],['A2','A2'],['B1','B1'],['B2','B2'],['C','C']])}</select></label><label>Niveau cible (facultatif)<select id="targetLevel">${options([['A1','A1'],['A2','A2'],['B1','B1'],['B2','B2'],['C','C']])}</select></label><label>Durée de l’objectif<div class="duration-row"><input id="duration" type="number" min="1" max="6" inputmode="numeric" placeholder="1 à 6"><span>mois</span></div></label></div>`;
  fields.querySelector('#chapterCount')?.addEventListener('change', event => { document.querySelector('#chapters').innerHTML = chapterFields(Number(event.target.value)); bindDynamicFields(); validateForm(); });
  bindDynamicFields(); restoreGoalFields(); validateForm();
}
function bindDynamicFields() { fields.querySelectorAll('input,select').forEach(element => element.addEventListener('input', validateForm)); fields.querySelectorAll('.level-choice button').forEach(button => button.addEventListener('click', () => selectDifficulty(button))); }
function restoreGoalFields() {
  if (!goal || goal.type !== selectedType) return;
  fields.querySelector('#goalTitleInput').value = goal.goalTitle || '';
  fields.querySelector('#goalDescriptionInput').value = goal.description || '';
  fields.querySelector('#goalDetailsInput').value = goal.additionalDetails || '';
  if (fields.querySelector('#level')) fields.querySelector('#level').value = goal.level || '';
  if (fields.querySelector('#targetLevel')) fields.querySelector('#targetLevel').value = goal.targetLevel || '';
  if (fields.querySelector('#language')) fields.querySelector('#language').value = goal.language || '';
  const duration = fields.querySelector('#duration');
  if (duration) duration.value = goal.duration.unit === 'weeks' ? goal.duration.value * 7 : goal.duration.value;
  const chapterCount = fields.querySelector('#chapterCount');
  if (chapterCount && goal.chapters?.length) {
    chapterCount.value = String(goal.chapters.length);
    document.querySelector('#chapters').innerHTML = chapterFields(goal.chapters.length);
    goal.chapters.forEach((chapter, index) => {
      const card = document.querySelectorAll('.chapter-card')[index];
      card.querySelector('.chapter-name').value = chapter.name;
      const button = card.querySelector(`.chapter-difficulty button[data-value="${chapter.difficulty}"]`);
      if (button) { button.classList.add('selected'); card.querySelector('.chapter-difficulty').dataset.value = chapter.difficulty; }
    });
    bindDynamicFields();
  }
}
function buildGoal() {
  const duration = Number(fields.querySelector('#duration')?.value);
  const common = { goalTitle: fields.querySelector('#goalTitleInput')?.value.trim(), description: fields.querySelector('#goalDescriptionInput')?.value.trim(), additionalDetails: fields.querySelector('#goalDetailsInput')?.value.trim() };
  if (selectedType === 'exam') { const chapters = [...fields.querySelectorAll('.chapter-card')].map(card => ({ name: card.querySelector('.chapter-name').value.trim(), difficulty: card.querySelector('.chapter-difficulty').dataset.value })); return { ...common, type: 'exam', level: fields.querySelector('#level')?.value.trim(), duration: { value: duration, unit: 'days' }, chapters }; }
  return { ...common, type: selectedType, language: fields.querySelector('#language')?.value, level: fields.querySelector('#level')?.value, ...(selectedType === 'language' && { targetLevel: fields.querySelector('#targetLevel')?.value || null }), duration: { value: duration, unit: selectedType === 'programming' ? 'days' : 'months' } };
}
function validationMessage(value = buildGoal()) {
  if (!selectedType) return 'Choisis un type d’objectif.';
  if (!value.goalTitle?.trim()) return 'Indique le but que tu veux atteindre.';
  if (value.type === 'exam') { if (!value.chapters.length || value.chapters.length > 6) return 'Choisis entre 1 et 6 chapitres.'; if (value.chapters.some(chapter => !chapter.name || !chapter.difficulty)) return 'Renseigne le nom et la difficulté de chaque chapitre.'; if (!Number.isInteger(value.duration.value) || value.duration.value < 3 || value.duration.value > 30) return 'Choisis une durée entre 3 et 30 jours.'; }
  if (value.type === 'programming' && (!value.language || !value.level || !Number.isInteger(value.duration.value) || value.duration.value < 3 || value.duration.value > 12)) return 'Renseigne le langage, le niveau et une durée de 3 à 12 semaines.';
  if (value.type === 'language' && (!value.language || !value.level || !Number.isInteger(value.duration.value) || value.duration.value < 1 || value.duration.value > 6)) return 'Renseigne la langue, le niveau et une durée de 1 à 6 mois.';
  return '';
}
function validateForm() { saveGoal.disabled = Boolean(validationMessage()); }
function appendMessage(role, text) { if (welcome.parentElement) welcome.remove(); let list = messages.querySelector('.message-list'); if (!list) { list = document.createElement('div'); list.className = 'message-list'; messages.append(list); } const block = document.createElement('div'); block.className = `message-block ${role}`; const bubble = document.createElement('div'); bubble.className = 'message-bubble'; if (role === 'assistant') { const icon = document.createElement('div'); icon.className = 'bot-logo'; icon.textContent = '◎'; block.append(icon); bubble.append(renderMarkdown(text)); } else { const paragraph = document.createElement('p'); paragraph.className = 'message-plain'; paragraph.textContent = text; bubble.append(paragraph); } block.append(bubble); list.append(block); messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' }); }
async function callApi(path, payload, method = 'POST') { const response = await authenticatedFetch(currentUser, path, { method, headers: { 'Content-Type': 'application/json' }, ...(payload && { body: JSON.stringify(payload) }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error?.message || 'Le serveur Goal AI est indisponible. Vérifie qu’il est lancé.'); return result; }
function renderPlan(plan) { if (!plan?.weeks?.length) return; appendMessage('assistant', formatProgramMarkdown(plan)); }
function updateProgressBar(barId, labelId, value) { const percentage = Math.max(0, Math.min(100, Number(value) || 0)); const bar = document.querySelector(`#${barId}`); const label = document.querySelector(`#${labelId}`); bar.style.width = `${percentage}%`; bar.parentElement.setAttribute('aria-valuenow', String(percentage)); label.textContent = `${percentage}%`; }
function renderTaskPlan(progress) {
  goalDashboard.hidden = !goal?.generatedPlan;
  goalTaskPlan.replaceChildren();
  if (!progress) return;
  for (const week of progress.weeks || []) {
    const section = document.createElement('details');
    section.className = 'goal-week'; section.open = week.week === progress.currentWeek || (progress.currentWeek == null && week.week === progress.weeks.at(-1)?.week);
    const summary = document.createElement('summary');
    const title = document.createElement('span'); title.textContent = `📆 Semaine ${week.week} — ${week.objective}`;
    const percentage = document.createElement('b'); percentage.textContent = `${week.percentage}%`;
    summary.append(title, percentage); section.append(summary);
    const weekTrack = document.createElement('div'); weekTrack.className = 'progress-track'; weekTrack.setAttribute('role', 'progressbar'); weekTrack.setAttribute('aria-label', `Progression semaine ${week.week}`); weekTrack.setAttribute('aria-valuemin', '0'); weekTrack.setAttribute('aria-valuemax', '100'); weekTrack.setAttribute('aria-valuenow', String(week.percentage));
    const weekBar = document.createElement('span'); weekBar.style.width = `${week.percentage}%`; weekTrack.append(weekBar); section.append(weekTrack);
    const count = document.createElement('small'); count.className = 'goal-task-count'; count.textContent = `${week.completed} / ${week.total} tâches terminées`; section.append(count);
    for (const day of (progress.days || []).filter(item => item.week === week.week)) {
      const dayCard = document.createElement('article'); dayCard.className = 'goal-day'; dayCard.dataset.week = String(day.week); dayCard.dataset.day = String(day.day);
      const dayHeader = document.createElement('div'); dayHeader.className = 'goal-day-head';
      const dayTitle = document.createElement('b'); dayTitle.textContent = `📅 Jour ${day.day} — ${day.title}`;
      const dayPercent = document.createElement('strong'); dayPercent.textContent = `${day.percentage}%`;
      dayHeader.append(dayTitle, dayPercent); dayCard.append(dayHeader);
      const dayTrack = document.createElement('div'); dayTrack.className = 'progress-track'; dayTrack.setAttribute('role', 'progressbar'); dayTrack.setAttribute('aria-label', `Progression semaine ${day.week}, jour ${day.day}`); dayTrack.setAttribute('aria-valuemin', '0'); dayTrack.setAttribute('aria-valuemax', '100'); dayTrack.setAttribute('aria-valuenow', String(day.percentage));
      const dayBar = document.createElement('span'); dayBar.style.width = `${day.percentage}%`; dayTrack.append(dayBar); dayCard.append(dayTrack);
      const dayCount = document.createElement('small'); dayCount.className = 'goal-task-count'; dayCount.textContent = `📊 Progression du jour · ${day.completed} / ${day.total} tâches`; dayCard.append(dayCount);
      const list = document.createElement('ul'); list.className = 'goal-task-list';
      for (const task of day.tasks) {
        const item = document.createElement('li'); item.className = `goal-task status-${task.status}`;
        const icon = document.createElement('span'); icon.className = 'goal-task-icon'; icon.textContent = ({ completed: '✅', in_progress: '🔵', available: '○', locked: '🔒' })[task.status];
        const label = document.createElement('span'); label.className = 'goal-task-title'; label.textContent = task.title;
        const state = document.createElement('small'); state.textContent = ({ completed: 'Terminée', in_progress: 'En cours', available: 'À faire', locked: 'Verrouillée' })[task.status];
        item.append(icon, label, state);
        if (task.status === 'in_progress' || task.status === 'available') {
          const complete = document.createElement('button'); complete.type = 'button'; complete.className = 'complete-task'; complete.dataset.taskId = task.id; complete.textContent = '✓ Terminer'; item.append(complete);
        }
        list.append(item);
      }
      dayCard.append(list); section.append(dayCard);
    }
    goalTaskPlan.append(section);
  }
}
function renderProgress(progress = goal?.progress) {
  if (!progress || !goal?.generatedPlan) { goalDashboard.hidden = true; return; }
  updateProgressBar('overallBar', 'overallPercent', progress.overallProgress);
  updateProgressBar('weeklyBar', 'weeklyPercent', progress.weeklyProgress);
  updateProgressBar('dailyBar', 'dailyPercent', progress.dailyProgress);
  document.querySelector('#overallCount').textContent = `${progress.completedTasks} / ${progress.totalTasks} tâches terminées`;
  const week = progress.weeks?.find(item => item.week === progress.currentWeek);
  const day = progress.days?.find(item => item.week === progress.currentWeek && item.day === progress.currentDay);
  document.querySelector('#weeklyObjective').textContent = week ? `🎯 ${week.objective}` : '🎉 Toutes les semaines sont terminées';
  document.querySelector('#dailyObjective').textContent = day ? `Jour ${day.day} — ${day.title}${day.focus ? ` · ${day.focus}` : ''}` : '🎉 Toutes les journées sont terminées';
  document.querySelector('#weeklyCount').textContent = week ? `${week.completed} / ${week.total} tâches terminées` : `${progress.completedTasks} / ${progress.totalTasks} tâches terminées`;
  document.querySelector('#dailyCount').textContent = day ? `${day.completed} / ${day.total} tâches terminées` : 'Aucune tâche restante';
  renderTaskPlan(progress);
}
function showTaskCompletion(previous, updated, completedWeek, completedDay) {
  if (updated.overallProgress === 100) {
    appendMessage('assistant', '## 🏆 Objectif atteint !\n\n🎉 Tu as terminé toutes les tâches de ton programme.');
    return;
  }
  const nextDay = updated.days?.find(day => day.week === updated.currentWeek && day.day === updated.currentDay);
  if (nextDay && completedDay && completedDay.percentage < 100 && nextDay.week === completedDay.week && nextDay.day === completedDay.day) return;
  if (completedDay && completedDay.percentage < 100 && nextDay && (nextDay.week !== completedDay.week || nextDay.day !== completedDay.day)) {
    appendMessage('assistant', `## 🎉 Journée terminée !\n\nTu as terminé toutes les tâches prévues aujourd’hui.\n\n📊 Progression du jour : **100%**\n\n💪 Prochaine étape : semaine ${nextDay.week}, jour ${nextDay.day} — ${nextDay.title}.`);
  }
  const weekAfter = updated.weeks?.find(week => week.week === completedWeek?.week);
  if (weekAfter?.percentage === 100 && completedWeek?.percentage < 100) {
    const nextWeek = updated.weeks.find(week => week.week === weekAfter.week + 1);
    appendMessage('assistant', `## 🎉 Semaine terminée !\n\n📊 Progression : **100%**\n\n${nextWeek ? `➡️ Prochaine étape : semaine ${nextWeek.week}.` : '🏆 Tu as terminé la dernière semaine !'}`);
  }
}
async function sendGoalMessage(text) {
  const message = text.trim(); if (!message) return;
  appendMessage('user', message); input.value = ''; updateComposer(); send.disabled = true;
  try {
    const result = await callApi('/api/goal/chat', { message, ...(activeQuiz ? { quizContext: activeQuiz } : {}) });
    activeQuiz = '';
    appendMessage('assistant', result.message.content);
    if (/mini-test|me tester|quiz/i.test(message)) activeQuiz = result.message.content.slice(0, 4000);
    await saveMessage('user', message); await saveMessage('assistant', result.message.content); await loadConversations();
  } catch (error) { activeQuiz = ''; appendMessage('assistant', error.message || 'Je n’ai pas pu contacter Goal AI.'); }
  finally { updateComposer(); }
}
async function createConversation(title = 'Nouvelle discussion') { const ref = await addDoc(goalConversations(), { title, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); conversationId = ref.id; await loadConversations(); }
async function saveMessage(role, content) { if (!conversationId) await createConversation(content.slice(0,48) || 'Nouvelle discussion'); await addDoc(collection(db, 'users', currentUser.uid, 'goals', 'default', 'conversations', conversationId, 'messages'), { role, content, timestamp: serverTimestamp() }); await updateDoc(doc(db, 'users', currentUser.uid, 'goals', 'default', 'conversations', conversationId), { updatedAt: serverTimestamp() }); }
async function loadConversations() { const snapshot = await getDocs(query(goalConversations(), orderBy('updatedAt','desc'), limit(8))); document.querySelectorAll('.recent-row').forEach(row => row.remove()); let after = document.querySelector('.recent-label'); snapshot.forEach(item => { const row = document.createElement('div'); row.className='recent-row'; const open=document.createElement('button'); open.className='recent'; open.textContent=item.data().title||'Nouvelle discussion'; open.onclick=()=>loadConversation(item.id); const remove=document.createElement('button'); remove.className='delete-conversation'; remove.textContent='×'; remove.title='Supprimer cette discussion'; remove.onclick=()=>deleteConversation(item.id); row.append(open,remove); after.insertAdjacentElement('afterend',row); after=row; }); }
async function loadConversation(id) { conversationId=id; messages.innerHTML=''; const snapshot=await getDocs(query(collection(db,'users',currentUser.uid,'goals','default','conversations',id,'messages'),orderBy('timestamp','asc'))); snapshot.forEach(item=>appendMessage(item.data().role,item.data().content)); }
async function deleteConversation(id) { if (!window.confirm('Supprimer définitivement cette discussion ?')) return; const children=await getDocs(collection(db,'users',currentUser.uid,'goals','default','conversations',id,'messages')); await Promise.all(children.docs.map(item=>deleteDoc(item.ref))); await deleteDoc(doc(db,'users',currentUser.uid,'goals','default','conversations',id)); if(conversationId===id){conversationId=null;messages.innerHTML='';messages.append(welcome);welcome.hidden=false;} await loadConversations(); }
function refreshGoalUi() { document.querySelector('#editGoal').hidden = !goal; document.querySelector('#deleteGoal').hidden = !goal; document.querySelector('#welcomeText').textContent = `Ton objectif : ${goalDescription()}. Goal AI adapte chaque étape à ton parcours.`; renderProgress(goal?.progress); }
document.querySelector('#typeChoices').addEventListener('click', event => { const button=event.target.closest('button[data-type]'); if(!button)return; selectedType=button.dataset.type; document.querySelectorAll('#typeChoices button').forEach(item=>item.classList.toggle('selected',item===button)); renderFields(); });
form.addEventListener('submit', async event => { event.preventDefault(); const issue=validationMessage(); if(issue)return showError(issue); saveGoal.disabled=true; saveGoal.textContent='Création…'; try { goal=buildGoal(); const result=await callApi('/api/goal/generate',goal); goal={...result.goal,generatedPlan:result.program,progress:result.progress}; modal.hidden=true; refreshGoalUi(); renderPlan(result.program); await loadConversations(); } catch(error) { showError(error.message || 'Impossible de générer ton programme. Réessaie.'); saveGoal.textContent='Créer mon objectif →'; validateForm(); } });
input.addEventListener('input',updateComposer); input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send.click();}}); send.addEventListener('click',()=>sendGoalMessage(input.value));
goalTaskPlan.addEventListener('click',async event=>{const button=event.target.closest('.complete-task');if(!button)return;const previous=goal.progress;const taskDay=previous.days.find(day=>day.tasks.some(task=>task.id===button.dataset.taskId));const taskWeek=previous.weeks.find(week=>week.week===taskDay?.week);button.disabled=true;try{const result=await callApi(`/api/goal/tasks/${encodeURIComponent(button.dataset.taskId)}`,null,'PATCH');goal.progress=result.progress;renderProgress();showTaskCompletion(previous,result.progress,taskWeek,taskDay);}catch(error){button.disabled=false;appendMessage('assistant',error.message||'Impossible de mettre à jour cette tâche.');}});
document.querySelector('#reachGoal').addEventListener('click',()=>sendGoalMessage('Analyse ma situation actuelle et aide-moi à terminer mon objectif de la semaine. Indique où j’en suis, ce qu’il me reste et propose une prochaine action concrète.'));
document.querySelector('#deleteGoal').addEventListener('click',async event=>{const button=event.currentTarget;if(!goal||!window.confirm('Supprimer définitivement ton objectif, son programme, sa progression et toutes les conversations Goal AI associées ?'))return;button.disabled=true;button.textContent='Suppression…';try{await callApi('/api/goal/current',null,'DELETE');goal=null;conversationId=null;activeQuiz='';messages.innerHTML='';messages.append(welcome);welcome.hidden=false;document.querySelector('#welcomeText').textContent='Définis un nouvel objectif pour créer ton parcours personnalisé.';document.querySelectorAll('.recent-row').forEach(row=>row.remove());document.querySelector('#editGoal').hidden=true;button.hidden=true;button.disabled=false;button.textContent='🗑 Supprimer mon objectif';goalDashboard.hidden=true;delete goalDashboard.dataset.mobileExpanded;goalDashboardDetails.hidden=true;const planToggle=document.querySelector('#toggleGoalPlan');planToggle.setAttribute('aria-expanded','false');planToggle.textContent='Voir les tâches';selectedType='';document.querySelectorAll('#typeChoices button').forEach(item=>item.classList.remove('selected'));renderFields();showError('');saveGoal.textContent='Créer mon objectif →';saveGoal.disabled=true;modal.hidden=false;}catch(error){button.disabled=false;button.textContent='🗑 Supprimer mon objectif';appendMessage('assistant',error.message||'Impossible de supprimer cet objectif. Réessaie.');}});
document.querySelector('#toggleGoalPlan').addEventListener('click',event=>{const button=event.currentTarget;const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));goalDashboard.dataset.mobileExpanded=String(expanded);goalDashboardDetails.hidden=!expanded;button.textContent=expanded?'Masquer les tâches':'Voir les tâches';});
document.querySelector('.goal-help-actions').addEventListener('click',event=>{const button=event.target.closest('[data-help]');if(!button)return;const prompts={explain:'Explique-moi la notion liée à ma tâche actuelle, simplement et selon mon niveau.',exercise:'Donne-moi un exercice lié à ma tâche actuelle et à l’objectif de cette semaine. Ne l’ajoute pas à mon programme.',revise:'Révise avec moi les notions nécessaires pour terminer les tâches restantes de cette semaine.',quiz:'Propose-moi un mini-test de 5 questions sur l’objectif de cette semaine. Attends mes réponses avant de donner la correction.',help:'J’ai besoin d’aide pour avancer sur mon objectif actuel.'};sendGoalMessage(prompts[button.dataset.help]||prompts.help);});
document.querySelector('#newChat').onclick=()=>{conversationId=null;messages.innerHTML='';messages.append(welcome);welcome.hidden=false;};document.querySelector('#editGoal').onclick=()=>{selectedType=goal.type;document.querySelectorAll('#typeChoices button').forEach(button=>button.classList.toggle('selected',button.dataset.type===selectedType));renderFields();modal.hidden=false;};document.querySelector('#closeGoal').onclick=()=>{modal.hidden=true;};document.querySelector('#logoutButton').onclick=async()=>{await signOut(auth);window.location.replace('auth.html');};
await authReady; onAuthStateChanged(auth,async user=>{if(!user)return window.location.replace('auth.html');currentUser=user;const profile=await getDoc(doc(db,'users',user.uid));if(!profile.exists()||!profile.data().profileCompleted)return window.location.replace('profile.html');document.querySelector('.student-card b').textContent=profile.data().fullName||profile.data().firstName||'Élève';document.querySelector('.student-avatar').textContent=(profile.data().firstName||'S').slice(0,1);const saved=await getDoc(goalRef());if(saved.exists()){const current=await callApi('/api/goal/current',null,'GET').catch(()=>null);goal=current?.goal||saved.data();refreshGoalUi();if(goal.generatedPlan)renderPlan(goal.generatedPlan);await loadConversations();}else modal.hidden=false;});
