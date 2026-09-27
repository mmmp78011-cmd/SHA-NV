// Learning memory is student-owned and explicitly editable. The chat endpoint
// never infers weaknesses or mastery from an ordinary question.
export async function getRelevantMemory(memory = {}) {
  return {
    learningGoals: Array.isArray(memory.learningGoals) ? memory.learningGoals.slice(0, 20) : [],
    studiedSubjects: Array.isArray(memory.studiedSubjects) ? memory.studiedSubjects.slice(0, 30) : [],
    difficultTopics: Array.isArray(memory.difficultTopics) ? memory.difficultTopics.slice(0, 30) : [],
    masteredTopics: Array.isArray(memory.masteredTopics) ? memory.masteredTopics.slice(0, 30) : [],
    preferredExplanationStyle: typeof memory.preferredExplanationStyle === 'string' ? memory.preferredExplanationStyle.slice(0, 200) : null
  };
}
