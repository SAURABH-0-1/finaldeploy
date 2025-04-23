import OpenAI from 'openai';
import { aiDataService } from '../ai-data-service';
import { knowledgeService } from './knowledge-service';
import { marketIntelligence } from './market-intelligence-service';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GrokResponse {
  message: string;
  intent?: any;
  suggestions?: string[];
  analysis?: {
    marketContext?: any;
    technicalAnalysis?: any;
    sentiment?: string;
  };
}

export class EnhancedGrokService {
  private static instance: EnhancedGrokService;

  private constructor() {}

  static getInstance(): EnhancedGrokService {
    if (!EnhancedGrokService.instance) {
      EnhancedGrokService.instance = new EnhancedGrokService();
    }
    return EnhancedGrokService.instance;
  }

  async processQuery(
    query: string,
    context: {
      walletConnected: boolean;
      walletAddress?: string;
      balance?: number;
      tokenBalances?: any[];
      expertiseLevel?: 'beginner' | 'intermediate' | 'advanced';
      marketContext?: any;
    }
  ): Promise<GrokResponse> {
    try {
      // Step 1: Enrich context with real-time data
      const enrichedContext = await this.enrichContext(context);

      // Step 2: Generate system prompt
      const systemPrompt = this.generateSystemPrompt(enrichedContext);

      // Step 3: Call OpenAI with function calling capabilities
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        tools: this.getAvailableTools(),
        tool_choice: "auto"
      });

      // Step 4: Process and enhance the response
      return await this.enhanceResponse(response, query, enrichedContext);
    } catch (error) {
      console.error('Error in Grok processing:', error);
      return {
        message: "I encountered an error processing your request. Let me try a different approach - what specifically would you like to know?",
        suggestions: ["Check market trends", "Analyze token performance", "View wallet stats"]
      };
    }
  }

  private async enrichContext(context: any) {
    // Fetch real-time market data
    const marketData = await aiDataService.getMarketData(['SOL', 'BTC', 'ETH']);
    const sentiment = await aiDataService.getMarketSentiment();
    
    // Get on-chain analytics
    const chainActivity = await this.getOnChainMetrics();
    
    return {
      ...context,
      marketData,
      sentiment,
      chainActivity,
      timestamp: new Date().toISOString()
    };
  }

  private generateSystemPrompt(context: any): string {
    const basePrompt = `You are an advanced AI assistant specializing in Web3 and crypto, with particular expertise in the Solana ecosystem. You have real-time access to:
- Market data and trends
- On-chain analytics
- Technical analysis
- Wallet data and transaction history
- Deep knowledge of DeFi protocols

Current market context:
- Market sentiment: ${context.sentiment?.overall || 'Neutral'}
- Top performing sectors: ${context.sentiment?.topSectors?.join(', ') || 'Data not available'}
- Notable trends: ${context.sentiment?.trends?.join(', ') || 'No significant trends'}

${context.walletConnected ? 
  `Wallet status: Connected (${context.walletAddress})
   Balance: ${context.balance} SOL
   Other tokens: ${context.tokenBalances?.length || 0} tokens` :
  'Wallet status: Not connected'}

Expertise level: ${context.expertiseLevel || 'beginner'}

When responding:
1. Provide data-driven insights
2. Include relevant market context
3. Offer actionable suggestions
4. Maintain a professional but engaging tone
5. Cite sources when providing market data`;

    return basePrompt;
  }

  private getAvailableTools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "analyzeMarket",
          description: "Analyze current market conditions and trends",
          parameters: {
            type: "object",
            properties: {
              timeframe: {
                type: "string",
                enum: ["24h", "7d", "30d"]
              },
              metrics: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["price", "volume", "social_sentiment", "dev_activity"]
                }
              }
            }
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "getTechnicalAnalysis",
          description: "Get technical analysis for a specific token",
          parameters: {
            type: "object",
            properties: {
              token: {
                type: "string",
                description: "Token symbol (e.g., SOL, BONK)"
              },
              timeframe: {
                type: "string",
                enum: ["1h", "4h", "1d", "1w"]
              }
            },
            required: ["token"]
          }
        }
      }
    ];
  }

  private async getOnChainMetrics() {
    try {
      // Implement on-chain metrics fetching
      return {
        dailyActiveUsers: "1.2M",
        totalValueLocked: "$845M",
        averageBlockTime: "400ms",
        dailyTransactions: "24.5M"
      };
    } catch (error) {
      console.error('Error fetching on-chain metrics:', error);
      return null;
    }
  }

  private async enhanceResponse(aiResponse: any, originalQuery: string, context: any): Promise<GrokResponse> {
    const responseMessage = aiResponse.choices[0]?.message;
    let enhancedResponse: GrokResponse = {
      message: responseMessage.content,
      suggestions: []
    };

    // Add market context if relevant
    if (this.isMarketRelatedQuery(originalQuery)) {
      const marketAnalysis = await marketIntelligence.getMarketAnalysis();
      enhancedResponse.analysis = {
        marketContext: marketAnalysis,
        sentiment: context.sentiment
      };
    }

    // Generate contextual suggestions
    enhancedResponse.suggestions = this.generateSuggestions(
      originalQuery,
      responseMessage.content,
      context
    );

    return enhancedResponse;
  }

  private isMarketRelatedQuery(query: string): boolean {
    const marketTerms = ['price', 'market', 'trend', 'analysis', 'movement', 'prediction'];
    return marketTerms.some(term => query.toLowerCase().includes(term));
  }

  private generateSuggestions(query: string, response: string, context: any): string[] {
    const suggestions: string[] = [];
    
    // Add market-related suggestions
    if (this.isMarketRelatedQuery(query)) {
      suggestions.push("Show detailed market analysis");
      suggestions.push("Compare with other tokens");
      suggestions.push("Check historical trends");
    }

    // Add wallet-related suggestions if connected
    if (context.walletConnected) {
      suggestions.push("Check my portfolio performance");
      suggestions.push("Show my transaction history");
      suggestions.push("Analyze my trading patterns");
    }

    // Add educational suggestions based on expertise
    if (context.expertiseLevel === 'beginner') {
      suggestions.push("Explain blockchain basics");
    } else if (context.expertiseLevel === 'advanced') {
      suggestions.push("Show advanced trading metrics");
    }

    return suggestions.slice(0, 3); // Return top 3 most relevant suggestions
  }
}

export const grokService = EnhancedGrokService.getInstance();