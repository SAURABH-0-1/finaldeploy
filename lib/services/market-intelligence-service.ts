/**
 * Enhanced market intelligence service with advanced analytics
 */
import { aiDataService, MarketSentiment } from '../ai-data-service';
import { knowledgeService } from './knowledge-service';

interface MarketAnalysis {
  overview: string;
  sentiment: {
    overall: string;
    fearGreedIndex: number;
    socialSentiment: string;
    topMentions: string[];
  };
  trends: {
    shortTerm: string[];
    mediumTerm: string[];
    emerging: string[];
  };
  metrics: {
    totalValueLocked: string;
    dailyVolume: string;
    dominanceIndex: Record<string, number>;
  };
  technicalSignals: {
    [key: string]: {
      sentiment: string;
      indicators: {
        macd: string;
        rsi: number;
        movingAverages: string;
      };
    };
  };
}

class MarketIntelligenceService {
  private static instance: MarketIntelligenceService;
  private lastUpdate: Date | null = null;
  private cachedAnalysis: MarketAnalysis | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): MarketIntelligenceService {
    if (!MarketIntelligenceService.instance) {
      MarketIntelligenceService.instance = new MarketIntelligenceService();
    }
    return MarketIntelligenceService.instance;
  }

  async getMarketAnalysis(): Promise<MarketAnalysis> {
    if (this.shouldRefreshCache()) {
      this.cachedAnalysis = await this.generateMarketAnalysis();
      this.lastUpdate = new Date();
    }
    return this.cachedAnalysis!;
  }

  private shouldRefreshCache(): boolean {
    if (!this.lastUpdate || !this.cachedAnalysis) return true;
    return Date.now() - this.lastUpdate.getTime() > this.CACHE_DURATION;
  }

  private async generateMarketAnalysis(): Promise<MarketAnalysis> {
    try {
      // Fetch data in parallel
      const [
        marketData,
        sentiment,
        onChainMetrics
      ]: [any[], MarketSentiment, any] = await Promise.all([
        aiDataService.getMarketData(['SOL', 'BTC', 'ETH', 'BONK', 'JUP']),
        aiDataService.getMarketSentiment(),
        this.getOnChainMetrics()
      ]);

      // Process market trends
      const trends = this.analyzeTrends(marketData);
      
      // Generate technical signals
      const technicalSignals = await this.generateTechnicalSignals(marketData);

      return {
        overview: this.generateMarketOverview(marketData, sentiment),
        sentiment: {
          overall: sentiment.marketTrend ?? 'neutral',
          fearGreedIndex: sentiment.fearGreedIndex ?? 0,
          socialSentiment: sentiment.fearGreedLabel ?? 'neutral',
          topMentions: []
        },
        trends: {
          shortTerm: trends.shortTerm,
          mediumTerm: trends.mediumTerm,
          emerging: trends.emerging
        },
        metrics: {
          totalValueLocked: onChainMetrics.tvl,
          dailyVolume: onChainMetrics.volume,
          dominanceIndex: this.calculateDominanceIndex(marketData)
        },
        technicalSignals
      };
    } catch (error) {
      console.error('Error generating market analysis:', error);
      throw error;
    }
  }

  private generateMarketOverview(marketData: any[], sentiment: any): string {
    const topPerformers = marketData
      .sort((a, b) => b.percentChange24h - a.percentChange24h)
      .slice(0, 3);
    
    const overallSentiment = sentiment.fearGreedIndex > 65 ? "bullish" :
                            sentiment.fearGreedIndex < 35 ? "bearish" : "neutral";

    return `Market is showing ${overallSentiment} signals with ${topPerformers[0].symbol} leading gains at ${topPerformers[0].percentChange24h.toFixed(2)}% in 24h. Volume trends indicate ${sentiment.volumeTrend || 'stable'} activity.`;
  }

  private analyzeTrends(marketData: any[]) {
    return {
      shortTerm: this.extractShortTermTrends(marketData),
      mediumTerm: this.extractMediumTermTrends(marketData),
      emerging: this.identifyEmergingTrends(marketData)
    };
  }

  private async generateTechnicalSignals(marketData: any[]) {
    const signals: Record<string, any> = {};
    
    for (const token of marketData) {
      signals[token.symbol] = {
        sentiment: this.calculateTechnicalSentiment(token),
        indicators: await this.calculateIndicators(token)
      };
    }
    
    return signals;
  }

  private calculateTechnicalSentiment(token: any): string {
    const priceChange = token.percentChange24h;
    const volume = token.volume24h;
    const prevVolume = token.volume24hPrevious || 0;
    
    if (priceChange > 5 && volume > prevVolume) return "strongly bullish";
    if (priceChange > 2 && volume > prevVolume) return "bullish";
    if (priceChange < -5 && volume > prevVolume) return "strongly bearish";
    if (priceChange < -2 && volume > prevVolume) return "bearish";
    return "neutral";
  }

  private async calculateIndicators(token: any) {
    return {
      macd: this.calculateMACD(token),
      rsi: this.calculateRSI(token),
      movingAverages: this.analyzeMovingAverages(token)
    };
  }

  private calculateMACD(token: any): string {
    // Simplified MACD calculation
    const shortTerm = token.percentChange24h || 0;
    const longTerm = token.percentChange7d || 0;
    return shortTerm > longTerm ? "bullish" : "bearish";
  }

  private calculateRSI(token: any): number {
    // Simplified RSI calculation
    const gains = Math.max(0, token.percentChange24h || 0);
    const losses = Math.abs(Math.min(0, token.percentChange24h || 0));
    return Math.round(100 - (100 / (1 + (gains / (losses || 1)))));
  }

  private analyzeMovingAverages(token: any): string {
    const price = token.price || 0;
    const ma50 = token.ma50 || price;
    const ma200 = token.ma200 || price;
    
    if (price > ma50 && ma50 > ma200) return "strong uptrend";
    if (price > ma50) return "uptrend";
    if (price < ma50 && ma50 < ma200) return "strong downtrend";
    if (price < ma50) return "downtrend";
    return "sideways";
  }

  private async getOnChainMetrics() {
    return {
      tvl: "$845M",
      volume: "$324M",
      transactions: "24.5M"
    };
  }

  private calculateDominanceIndex(marketData: any[]): Record<string, number> {
    const total = marketData.reduce((sum, token) => sum + (token.marketCap || 0), 0);
    const dominance: Record<string, number> = {};
    
    marketData.forEach(token => {
      if (token.marketCap) {
        dominance[token.symbol] = Number(((token.marketCap / total) * 100).toFixed(2));
      }
    });
    
    return dominance;
  }

  private extractShortTermTrends(marketData: any[]): string[] {
    const trends: string[] = [];
    const volume24hChange = marketData.reduce((sum, token) => sum + (token.volumeChange24h || 0), 0) / marketData.length;
    
    if (volume24hChange > 20) trends.push("High volume spike across markets");
    if (volume24hChange < -20) trends.push("Volume declining across markets");
    
    const gainers = marketData.filter(t => t.percentChange24h > 5).length;
    const losers = marketData.filter(t => t.percentChange24h < -5).length;
    
    if (gainers > marketData.length * 0.6) trends.push("Broad market rally");
    if (losers > marketData.length * 0.6) trends.push("Market-wide correction");
    
    return trends;
  }

  private extractMediumTermTrends(marketData: any[]): string[] {
    const trends: string[] = [];
    const avgChange7d = marketData.reduce((sum, token) => sum + (token.percentChange7d || 0), 0) / marketData.length;
    
    if (avgChange7d > 10) trends.push("Strong bullish week");
    if (avgChange7d < -10) trends.push("Bearish weekly trend");
    
    return trends;
  }

  private identifyEmergingTrends(marketData: any[]): string[] {
    const trends: string[] = [];
    const socialGaining = marketData
      .filter(t => t.socialMentionsChange24h > 50)
      .map(t => t.symbol);
    
    if (socialGaining.length > 0) {
      trends.push(`Rising social interest in: ${socialGaining.join(', ')}`);
    }
    
    const developmentActive = marketData
      .filter(t => t.githubActivity24h > 10)
      .map(t => t.symbol);
    
    if (developmentActive.length > 0) {
      trends.push(`Active development in: ${developmentActive.join(', ')}`);
    }
    
    return trends;
  }

  async analyzePriceTrend(token: string): Promise<any> {
    const analysis = await this.getMarketAnalysis();
    return analysis.technicalSignals[token] || null;
  }

  async getMarketSentiment(): Promise<MarketSentiment> {
    const analysis = await this.getMarketAnalysis();
    return {
      fearGreedIndex: analysis.sentiment.fearGreedIndex,
      fearGreedLabel: analysis.sentiment.socialSentiment,
      marketTrend: analysis.sentiment.overall as 'bullish' | 'bearish' | 'neutral'
    };
  }

  async getComprehensiveAnalysis(token?: string): Promise<any> {
    const analysis = await this.getMarketAnalysis();
    if (token) {
      return {
        ...analysis,
        tokenSpecific: analysis.technicalSignals[token] || null
      };
    }
    return analysis;
  }
}

export const marketIntelligence = MarketIntelligenceService.getInstance();
