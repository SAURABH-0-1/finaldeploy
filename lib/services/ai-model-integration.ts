/**
 * AI model integration service to orchestrate all AI components
 */
import { grokService } from './enhanced-grok-service';
import { knowledgeService } from './knowledge-service';
import { aiTrainingAdapter } from './ai-training-adapter';

export class AIModelIntegrationService {
  async generateEnhancedResponse(
    prompt: string,
    context: {
      walletConnected: boolean;
      walletAddress: string | null;
      balance: number;
      tokenBalances?: any[];
      expertiseLevel?: 'beginner' | 'intermediate' | 'advanced';
      previousInteractions?: Array<{prompt: string, response: string}>;
      sessionId?: string;
      startTime?: number;
      marketContext?: any;
    }
  ): Promise<{
    message: string;
    intent?: any;
    suggestions?: string[];
  }> {
    try {
      // Process through Grok-like service
      const grokResponse = await grokService.processQuery(prompt, {
        ...context,
        walletAddress: context.walletAddress ?? undefined
      });

      // Record interaction for training
      aiTrainingAdapter.recordInteraction(prompt, grokResponse.message, {
        responseTime: Date.now() - (context.startTime || Date.now()),
        walletConnected: context.walletConnected,
        explicitFeedback: 'neutral'
      });

      return {
        message: grokResponse.message,
        intent: grokResponse.intent,
        suggestions: grokResponse.suggestions
      };
    } catch (error) {
      console.error('Error in generateEnhancedResponse:', error);
      return {
        message: "I encountered an unexpected issue. Let me know what specific information you're looking for, and I'll help you out.",
        suggestions: ["Check market trends", "View wallet balance", "Learn about DeFi"]
      };
    }
  }
}

// Export singleton instance
export const aiModel = new AIModelIntegrationService();
