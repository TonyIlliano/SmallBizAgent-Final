/**
 * Knowledge Prompt Builder
 *
 * Builds the knowledge base section that gets injected into the AI receptionist's
 * system prompt. Fetches approved knowledge entries and formats them as Q&A pairs
 * organized by category, with token budget management.
 */

import { storage } from '../storage';

// Category display names for the prompt
const CATEGORY_LABELS: Record<string, string> = {
  'policies': 'BUSINESS POLICIES',
  'service_area': 'SERVICE AREA & COVERAGE',
  'faq': 'FREQUENTLY ASKED QUESTIONS',
  'pricing': 'PRICING NOTES (supplements CRM service prices)',
  'about': 'ABOUT THE BUSINESS',
  'general': 'GENERAL INFORMATION',
};

/**
 * Build the knowledge section for the AI receptionist system prompt.
 * Fetches all approved knowledge entries, groups by category, formats as Q&A pairs.
 * Manages token budget to avoid bloating the prompt.
 *
 * @param businessId - The business to build knowledge for
 * @param maxCharBudget - Maximum characters for the knowledge section (~4 chars per token)
 * @returns Formatted knowledge section string, or empty string if no knowledge exists
 */
export async function buildKnowledgeSection(
  businessId: number,
  maxCharBudget: number = 8000 // ~2000 tokens
): Promise<string> {
  try {
    // Fetch all approved knowledge entries, sorted by priority (highest first)
    const entries = await storage.getBusinessKnowledge(businessId, { isApproved: true });

    if (!entries || entries.length === 0) {
      return '';
    }

    // Group entries by category
    const grouped: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const category = entry.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(entry);
    }

    // Build the formatted section
    const sections: string[] = [];
    let totalChars = 0;

    // Process categories in a defined order
    const categoryOrder = ['policies', 'service_area', 'faq', 'pricing', 'about', 'general'];

    for (const category of categoryOrder) {
      const categoryEntries = grouped[category];
      if (!categoryEntries || categoryEntries.length === 0) continue;

      const label = CATEGORY_LABELS[category] || category.toUpperCase();
      let sectionText = `${label}:\n`;

      for (const entry of categoryEntries) {
        const entryText = `Q: ${entry.question}\nA: ${entry.answer}\n`;

        // Check if adding this entry would exceed budget
        if (totalChars + sectionText.length + entryText.length > maxCharBudget) {
          // Budget exceeded — stop adding entries
          if (sectionText.endsWith(':\n')) {
            // No entries were added to this category section, skip it
            break;
          }
          sections.push(sectionText);
          return sections.join('\n');
        }

        sectionText += entryText + '\n';
      }

      // Only add the section if it has entries (not just the header)
      if (!sectionText.endsWith(':\n')) {
        totalChars += sectionText.length;
        sections.push(sectionText);
      }
    }

    // Also include any categories not in the defined order
    for (const [category, categoryEntries] of Object.entries(grouped)) {
      if (categoryOrder.includes(category)) continue;
      if (!categoryEntries || categoryEntries.length === 0) continue;

      const label = category.toUpperCase();
      let sectionText = `${label}:\n`;

      for (const entry of categoryEntries) {
        const entryText = `Q: ${entry.question}\nA: ${entry.answer}\n`;
        if (totalChars + sectionText.length + entryText.length > maxCharBudget) {
          if (!sectionText.endsWith(':\n')) {
            sections.push(sectionText);
          }
          return sections.join('\n');
        }
        sectionText += entryText + '\n';
      }

      if (!sectionText.endsWith(':\n')) {
        totalChars += sectionText.length;
        sections.push(sectionText);
      }
    }

    return sections.join('\n');
  } catch (error) {
    console.error('Error building knowledge section:', error);
    return '';
  }
}
