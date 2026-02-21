/**
 * Unanswered Question Detection Service
 *
 * Analyzes call transcripts after each call to detect questions the AI receptionist
 * couldn't fully answer. Surfaces these as notifications for business owners to
 * provide one-tap answers, which then get promoted to the knowledge base.
 *
 * Flow:
 * 1. Call ends → handleEndOfCall fires → this service analyzes transcript
 * 2. AI detects unanswered/deflected questions
 * 3. Questions stored in unanswered_questions table
 * 4. Business owner sees notification → provides answer
 * 5. Answer promoted to business_knowledge → Vapi prompt updated
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import { debouncedUpdateVapiAssistant } from './vapiProvisioningService';

/**
 * Analyze a call transcript to detect unanswered questions.
 * This runs as fire-and-forget after each call — must not throw.
 */
export async function analyzeTranscriptForUnansweredQuestions(
  businessId: number,
  callLogId: number,
  transcript: string,
  callerPhone?: string
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // OpenAI not configured — silently skip
    return;
  }

  // Don't analyze very short transcripts (likely hangups or wrong numbers)
  if (!transcript || transcript.length < 100) {
    return;
  }

  try {
    const openai = new OpenAI({ apiKey });

    // Truncate very long transcripts
    const truncatedTranscript = transcript.substring(0, 15000);

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      temperature: 0.2,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are analyzing a phone call transcript between an AI receptionist and a caller.

Identify any questions the caller asked that the AI could NOT fully answer, deflected, or gave a vague/generic response to.

Signs of an unanswered question:
- AI says "I'm not sure about that" or "I don't have that information"
- AI deflects to "you can check our website" or "I'll have someone call you back"
- AI gives a very generic answer that doesn't specifically address what was asked
- AI changes the subject instead of answering
- Caller seems unsatisfied with the answer and asks again

Return a JSON array of objects: [{ "question": "...", "context": "..." }]

Where:
- "question": The caller's question, rephrased clearly (e.g., "Do you offer financing?")
- "context": A brief excerpt from the transcript showing where this came up (1-2 sentences)

Rules:
- Only include genuinely unanswered questions
- Do NOT include questions the AI answered correctly and completely
- Do NOT include rhetorical questions or small talk
- Do NOT include requests the AI handled (like booking, scheduling, etc.)
- Maximum 5 unanswered questions per call
- If all questions were answered well, return an empty array: []

Return valid JSON array only, no markdown.`
        },
        {
          role: 'user',
          content: `Analyze this call transcript for unanswered questions:\n\n${truncatedTranscript}`
        }
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return;

    // Parse JSON response
    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let detectedQuestions: Array<{ question: string; context: string }>;
    try {
      detectedQuestions = JSON.parse(jsonStr);
    } catch {
      console.warn('Failed to parse unanswered questions JSON:', content.substring(0, 200));
      return;
    }

    if (!Array.isArray(detectedQuestions) || detectedQuestions.length === 0) {
      return; // No unanswered questions — great!
    }

    // Cap at 5 per call
    detectedQuestions = detectedQuestions.slice(0, 5);

    console.log(`Detected ${detectedQuestions.length} unanswered questions from call ${callLogId} for business ${businessId}`);

    // Deduplicate against existing pending questions
    for (const detected of detectedQuestions) {
      if (!detected.question || typeof detected.question !== 'string') continue;

      const isDuplicate = await deduplicateQuestion(businessId, detected.question);
      if (isDuplicate) {
        console.log(`Skipping duplicate question: "${detected.question.substring(0, 50)}..."`);
        continue;
      }

      await storage.createUnansweredQuestion({
        businessId,
        callLogId,
        question: detected.question,
        context: detected.context || null,
        callerPhone: callerPhone || null,
        status: 'pending',
      });
    }

  } catch (error) {
    console.error(`Error analyzing transcript for business ${businessId}:`, error);
    // Fire-and-forget — don't throw
  }
}

/**
 * Check if a similar question already exists as pending for this business.
 * Uses simple keyword overlap to detect duplicates.
 */
async function deduplicateQuestion(businessId: number, newQuestion: string): Promise<boolean> {
  try {
    const existingQuestions = await storage.getUnansweredQuestions(businessId, { status: 'pending' });

    if (existingQuestions.length === 0) return false;

    // Normalize: lowercase, remove punctuation, split into words
    const normalize = (text: string) => {
      return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    };

    const newWordsArr = normalize(newQuestion);
    if (newWordsArr.length === 0) return false;
    const newWordsSet = new Set(newWordsArr);

    for (const existing of existingQuestions) {
      const existingWordsArr = normalize(existing.question);
      if (existingWordsArr.length === 0) continue;
      const existingWordsSet = new Set(existingWordsArr);

      // Calculate word overlap using array iteration (avoid Set iteration for TS target compatibility)
      let overlap = 0;
      for (let i = 0; i < newWordsArr.length; i++) {
        if (existingWordsSet.has(newWordsArr[i])) overlap++;
      }

      // If >60% of words overlap, consider it a duplicate
      const overlapRatio = overlap / Math.min(newWordsSet.size, existingWordsSet.size);
      if (overlapRatio > 0.6) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error deduplicating question:', error);
    return false; // Don't skip on error
  }
}

/**
 * Promote an unanswered question to the knowledge base.
 * Called when the business owner provides an answer.
 */
export async function promoteToKnowledge(
  questionId: number,
  answer: string
): Promise<{ success: boolean; knowledgeEntryId?: number; error?: string }> {
  try {
    const question = await storage.getUnansweredQuestion(questionId);
    if (!question) {
      return { success: false, error: 'Question not found' };
    }

    if (question.status === 'answered') {
      return { success: false, error: 'Question already answered' };
    }

    // Create knowledge entry
    const knowledgeEntry = await storage.createBusinessKnowledge({
      businessId: question.businessId,
      question: question.question,
      answer: answer,
      category: 'faq', // Owner-answered questions go to FAQ category
      source: 'unanswered_question',
      isApproved: true, // Auto-approved since the owner provided the answer
      priority: 8, // Higher priority than website-sourced entries
    });

    // Update the unanswered question status
    await storage.updateUnansweredQuestion(questionId, {
      status: 'answered',
      ownerAnswer: answer,
      answeredAt: new Date(),
      knowledgeEntryId: knowledgeEntry.id,
    });

    // Trigger Vapi assistant update to include the new knowledge
    try {
      debouncedUpdateVapiAssistant(question.businessId);
    } catch (e) {
      console.warn('Could not trigger Vapi update after promoting question:', e);
    }

    console.log(`Promoted question ${questionId} to knowledge entry ${knowledgeEntry.id} for business ${question.businessId}`);
    return { success: true, knowledgeEntryId: knowledgeEntry.id };

  } catch (error: any) {
    console.error('Error promoting question to knowledge:', error);
    return { success: false, error: error.message || String(error) };
  }
}
