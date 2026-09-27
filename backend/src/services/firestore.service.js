import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import '../config/firebase.js';
import { AppError } from '../utils/errors.js';
import { calculateGoalProgress, completeGoalTask } from '../utils/goalProgress.js';

const firestore = getFirestore();
const userRef = uid => firestore.collection('users').doc(uid);

export async function getStudentContext(uid) {
  const [profileSnapshot, memorySnapshot, progressSnapshot] = await Promise.all([
    userRef(uid).get(),
    userRef(uid).collection('memory').doc('default').get(),
    userRef(uid).collection('progress').doc('overview').get()
  ]);
  return {
    profile: profileSnapshot.exists ? profileSnapshot.data() : {},
    memory: memorySnapshot.exists ? memorySnapshot.data() : {},
    progress: progressSnapshot.exists ? progressSnapshot.data() : {}
  };
}

function conversationRef(uid, conversationId) {
  return userRef(uid).collection('conversations').doc(conversationId);
}

export async function getRecentMessages(uid, conversationId, maxMessages) {
  if (!conversationId) return [];
  const conversation = await conversationRef(uid, conversationId).get();
  if (!conversation.exists) throw new AppError(404, 'Cette conversation n’existe pas.', 'CONVERSATION_NOT_FOUND');
  const snapshot = await conversation.ref.collection('messages').orderBy('timestamp', 'desc').limit(maxMessages).get();
  return snapshot.docs.reverse().map(doc => ({ role: doc.get('role'), content: String(doc.get('content') || '').slice(0, 12000) })).filter(item => ['user', 'assistant'].includes(item.role) && item.content);
}

export async function saveAssistantExchange(uid, { conversationId, userMessage, mode, attachments, response }) {
  const ref = conversationRef(uid, conversationId);
  const existing = await ref.get();
  const [userMessageRef, answerRef] = [ref.collection('messages').doc(), ref.collection('messages').doc()];
  const batch = firestore.batch();
  const timestamp = FieldValue.serverTimestamp();
  if (!existing.exists) batch.set(ref, { title: userMessage.slice(0, 48), createdAt: timestamp, updatedAt: timestamp });
  else batch.update(ref, { updatedAt: timestamp });
  batch.set(userMessageRef, {
    role: 'user', content: userMessage, mode, timestamp,
    ...(attachments.length ? { attachments } : {})
  });
  batch.set(answerRef, { role: 'assistant', content: response, mode, timestamp });
  await batch.commit();
  return { conversationId, timestamp: new Date().toISOString() };
}

export async function getCurrentGoal(uid) {
  const snapshot = await userRef(uid).collection('goals').doc('default').get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function deleteCurrentGoal(uid) {
  const ref = userRef(uid).collection('goals').doc('default');
  await firestore.recursiveDelete(ref);
}

export async function initializeGoalProgress(uid) {
  const ref = userRef(uid).collection('goals').doc('default');
  const current = await ref.get();
  if (!current.exists) return null;
  const saved = current.data();
  if (!saved.generatedPlan) return saved;
  if (saved.progress?.taskStatuses && Array.isArray(saved.progress.days) && Array.isArray(saved.progress.weeks)) return saved;
  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const goal = snapshot.data();
    if (!goal.generatedPlan) return goal;
    const progress = calculateGoalProgress(goal.generatedPlan, goal.progress?.taskStatuses || {});
    transaction.set(ref, {
      progress: { ...progress, updatedAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { ...goal, progress };
  });
}

export async function completeGoalTaskForUser(uid, taskId) {
  const ref = userRef(uid).collection('goals').doc('default');
  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || !snapshot.data().generatedPlan) {
      throw new AppError(404, 'Aucun programme Goal AI n’est disponible.', 'GOAL_PROGRAM_NOT_FOUND');
    }
    const goal = snapshot.data();
    const progress = completeGoalTask(goal.generatedPlan, goal.progress?.taskStatuses || {}, taskId);
    transaction.set(ref, {
      progress: { ...progress, updatedAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return progress;
  });
}

export async function saveCurrentGoal(uid, goal) {
  const ref = userRef(uid).collection('goals').doc('default');
  const snapshot = await ref.get();
  const timestamp = FieldValue.serverTimestamp();
  await ref.set({ ...goal, goalForm: goal, generatedPlan: null, ...(snapshot.exists ? {} : { createdAt: timestamp }), updatedAt: timestamp }, { merge: true });
  return (await ref.get()).data();
}

export async function saveStudyPlan(uid, plan, goalForm) {
  const ref = userRef(uid).collection('goals').doc('default');
  const snapshot = await ref.get();
  const timestamp = FieldValue.serverTimestamp();
  const progress = calculateGoalProgress(plan);
  await ref.set({
    ...goalForm,
    goalForm,
    generatedPlan: plan,
    ...(snapshot.exists ? {} : { createdAt: timestamp }),
    updatedAt: timestamp,
    planUpdatedAt: timestamp,
    progress: { ...progress, updatedAt: timestamp }
  }, { merge: true });
  return progress;
}
