"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { useConnection } from "@solana/wallet-adapter-react"
import type { AIMessage } from "@/lib/utils"
import { parseUserIntent } from "@/lib/enhanced-ai"
import { useWalletStore } from "@/lib/wallet-store"
import { formatWalletAddress } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import * as RxIcons from "react-icons/rx"
import * as FaIcons from "react-icons/fa"
import * as MdIcons from "react-icons/md"
import * as HiIcons from "react-icons/hi"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { SwapExecutor } from "@/components/SwapExecutor"
import { TransferExecutor } from "@/components/TransferExecutor"
import { TransactionConfirmationModal } from "@/components/TransactionConfirmationModal"
import { TokenTransferService, TransferResponse } from "@/lib/token-transfer-service"
import { cryptoMarketService, type CryptoMarketData } from "@/lib/services/crypto-market-service"
import { generateMarketIntelligence } from "@/lib/modules/crypto-market-intelligence"
import { getCoinInfo } from "@/lib/modules/crypto-knowledge-base"
import { fetchTokenData } from "@/lib/services/token-data-service"
import { CustomScrollbar } from "@/components/custom-scrollbar"
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { WalletContextState } from "@solana/wallet-adapter-react"
import { PublicKey } from '@solana/web3.js'
import { aiModel } from '@/lib/services/ai-model-integration';
import { aiDataService } from '@/lib/ai-data-service';
import { knowledgeService } from '@/lib/services/knowledge-service'

// SuggestionChip component for interactive suggestion buttons
const SuggestionChip = ({ suggestion, onSelect }: { suggestion: string; onSelect: (s: string) => void }) => (
  <motion.button
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.05, backgroundColor: "" }}
    whileTap={{ scale: 0.95 }}
    onClick={() => onSelect(suggestion)}
    className="px-3 py-1.5 text-sm bg-secondary/60 text-secondary-foreground rounded-full transition-colors backdrop-blur-sm border border-secondary/20"
  >
    {suggestion}
  </motion.button>
)

// Message component with support for markdown, code highlighting, and copy functionality
const ChatMessage = ({ message, isLast }: { message: AIMessage; isLast: boolean }) => {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`py-6 px-4 md:px-6 group flex gap-4 ${
        message.role === "assistant" ? "bg-card/30 backdrop-blur-sm" : ""
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {message.role === "assistant" ? (
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <MdIcons.MdSmartToy className="text-primary/80 text-lg" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center">
            <FaIcons.FaUser className="text-secondary/80 text-sm" />
          </div>
        )}
      </div>
      {/* Message content */}
      <div className="flex-1 overflow-hidden">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "")
                return !inline && match ? (
                  <div className="relative rounded-md overflow-hidden">
                    <div className="absolute right-2 top-2 z-10">
                      <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md bg-secondary/40 hover:bg-secondary/60 text-secondary-foreground transition-colors"
                        aria-label="Copy code"
                      >
                        {copied ? <RxIcons.RxCheck size={18} /> : <RxIcons.RxCopy size={18} />}
                      </button>
                    </div>
                    <SyntaxHighlighter
                      style={atomDark as any}
                      language={match[1]}
                      PreTag="div"
                      className="!bg-black/80 !mt-0 text-xs md:text-sm"
                      {...props}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className={`${className} px-1 py-0.5 rounded bg-muted`} {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
      {/* Copy button for assistant messages */}
      {message.role === "assistant" && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Copy message"
          >
            {copied ? <RxIcons.RxCheck size={18} /> : <RxIcons.RxCopy size={18} />}
          </button>
        </div>
      )}
    </motion.div>
  )
}

interface TransactionConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  intent: any;
  isLoading: boolean;
}

// Main ChatInterface component
export function ChatInterface() {
  const wallet = useWallet()
  const { connection } = useConnection()
  const { walletData, setWalletAddress } = useWalletStore()
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm your Web3 AI assistant. How can I help you with Solana transactions today?",
    },
  ])
  const [suggestions, setSuggestions] = useState<string[]>([
    "Check my balance",
    "What can you help me with?",
    "How do I swap tokens?",
    "Tell me about Solana",
  ])
  const [input, setInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [marketData, setMarketData] = useState<CryptoMarketData[]>([])
  const [marketDataLoaded, setMarketDataLoaded] = useState(false)
  const [lastMarketUpdate, setLastMarketUpdate] = useState<Date | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [lastMessageCount, setLastMessageCount] = useState(messages.length)
  const [pendingSwapIntent, setPendingSwapIntent] = useState<any | null>(null)
  const [autoExecuteSwap, setAutoExecuteSwap] = useState<boolean>(false)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [transferIntent, setTransferIntent] = useState<any>(null)
  const [autoExecuteTransfer, setAutoExecuteTransfer] = useState<boolean>(false)
  const [showTransactionConfirmation, setShowTransactionConfirmation] = useState(false)
  const [isExecutingTransfer, setIsExecutingTransfer] = useState(false)
  const [transaction, setTransaction] = useState<any>(null)
  const [marketContext, setMarketContext] = useState<any>(null);
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const data = await cryptoMarketService.getTopCoins(30)
        setMarketData(data)
        setMarketDataLoaded(true)
        setLastMarketUpdate(new Date())
      } catch (error) {
        console.error("Error fetching market data:", error)
      }
    }
    fetchMarketData()
    const intervalId = setInterval(fetchMarketData, 2 * 60 * 1000)
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (marketDataLoaded && !messages.some((m) => m.content.includes("cryptocurrency prices"))) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I can also provide you with real-time cryptocurrency prices and market trends. Feel free to ask me about Bitcoin, Ethereum, or any other major cryptocurrency! You can even paste token contract addresses from Ethereum, BSC, or Solana to get detailed information.",
          },
        ])
        setSuggestions([
          "What's the price of Bitcoin?",
          "How is the crypto market doing?",
          "Show me top performing coins",
          "Analyze this: 0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        ])
      }, 1000)
    }
  }, [marketDataLoaded, messages])

  const isNearBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return true

    const threshold = 100
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior,
        block: "end",
      })
    }
  }, [])

  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const nearBottom = isNearBottom()
      setShouldAutoScroll(nearBottom)
      setShowScrollButton(!nearBottom && messages.length > 1)
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [isNearBottom, messages.length])

  useEffect(() => {
    if (messages.length > lastMessageCount) {
      const isResponseToUserMessage =
        messages.length >= 2 &&
        messages[messages.length - 1].role === "assistant" &&
        messages[messages.length - 2].role === "user"

      const shouldScroll = shouldAutoScroll || isResponseToUserMessage

      if (shouldScroll) {
        setTimeout(() => {
          scrollToBottom(messages.length === 1 ? "auto" : "smooth")
        }, 100)
      } else {
        setShowScrollButton(true)
      }
    }

    setLastMessageCount(messages.length)
  }, [messages, lastMessageCount, shouldAutoScroll, scrollToBottom])

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      const publicKey = wallet.publicKey;
      setWalletAddress(publicKey.toString())
    }
  }, [wallet.publicKey, wallet.connected, setWalletAddress])

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      const publicKey = wallet.publicKey;
      if (!messages.some((m) => m.content.includes("wallet is connected"))) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Great! Your wallet is connected. Your address is ${formatWalletAddress(publicKey.toString())}. How can I assist you with your Solana transactions?`,
          },
        ])
      }

      if (walletData.solBalance > 0 && !messages.some((m) => m.content.includes("wallet has")) && messages.length < 3) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `I see your wallet has ${walletData.solBalance.toFixed(4)} SOL and ${walletData.tokens.length} other tokens. What would you like to do today?`,
          },
        ])
      }
    }
  }, [wallet.connected, wallet.publicKey, walletData, messages])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
    }
  }, [input])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const generateCoinInfoResponse = (symbol: string): string | null => {
    const coinInfo = getCoinInfo(symbol)
    if (!coinInfo) return null

    const marketInfo = marketData.find((coin) => coin.symbol.toUpperCase() === symbol.toUpperCase())

    let response = `## ${coinInfo.name} (${coinInfo.symbol})\n\n`
    response += `${coinInfo.description}\n\n`

    response += `**Category:** ${coinInfo.category}\n`
    if (coinInfo.blockchain) {
      response += `**Blockchain:** ${coinInfo.blockchain}\n`
    }
    if (coinInfo.launchYear) {
      response += `**Launched:** ${coinInfo.launchYear}\n`
    }

    response += `\n**Primary Use Cases:**\n`
    coinInfo.useCase.forEach((use) => {
      response += `- ${use}\n`
    })

    if (coinInfo.features) {
      response += `\n**Key Features:**\n`
      coinInfo.features.forEach((feature) => {
        response += `- ${feature}\n`
      })
    }

    if (marketInfo) {
      response += `\n**Current Market Data:**\n`
      response += `- Price: ${marketInfo.price.toFixed(6)}\n`
      response += `- 24h Change: ${marketInfo.percentChange24h > 0 ? "+" : ""}${marketInfo.percentChange24h.toFixed(2)}%\n`
      if (marketInfo.marketCap) {
        response += `- Market Cap: ${(marketInfo.marketCap / 1000000).toFixed(2)}M\n`
      }
    }

    if (coinInfo.additionalInfo) {
      response += `\n${coinInfo.additionalInfo}`
    }

    return response
  }

  const testTransfer = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      console.error('Wallet not connected');
      return;
    }

    try {
      const recipientAddress = wallet.publicKey.toBase58();
      setShowTransactionConfirmation(true);
      setTransaction({
        type: 'transfer',
        amount: '0.1',
        token: 'SOL',
        recipient: recipientAddress
      });
    } catch (error) {
      console.error('Error in test transfer:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    try {
      setIsProcessing(true);
      const userMessage: AIMessage = { role: "user", content: input };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setSuggestions([]);

      const context = {
        walletConnected: wallet?.connected || false,
        walletAddress: wallet?.publicKey?.toString() || "",
        balance: walletData.solBalance || 0,
        tokenBalances: walletData.tokens || [],
        marketData: marketDataLoaded ? marketData : null,
        lastMarketUpdate: lastMarketUpdate?.toISOString(),
        expertiseLevel: determineUserExpertise(messages),
        marketContext: await getMarketContext(),
        previousInteractions: messages.slice(-5).map(m => ({
          prompt: m.role === 'user' ? m.content : '',
          response: m.role === 'assistant' ? m.content : ''
        }))
      };

      const aiResponse = await aiModel.generateEnhancedResponse(input, context);

      const assistantMessage: AIMessage = {
        role: "assistant",
        content: aiResponse.message
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      if (aiResponse.suggestions?.length) {
        setSuggestions(aiResponse.suggestions);
      }

      if (aiResponse.intent) {
        await handleAIResponse(aiResponse.intent);
      }

    } catch (error) {
      console.error("Error in handleSendMessage:", error);
      const errorMessage: AIMessage = {
        role: "assistant",
        content: "I encountered an error processing your request. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const getMarketContext = async () => {
    try {
      const [marketData, sentiment] = await Promise.all([
        aiDataService.getMarketData(['SOL', 'BONK', 'JUP', 'USDC']),
        aiDataService.getMarketSentiment()
      ]);
      
      return {
        marketData,
        sentiment,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching market context:', error);
      return null;
    }
  };

  const determineUserExpertise = (messages: AIMessage[]): 'beginner' | 'intermediate' | 'advanced' => {
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
    
    const advancedTerms = ['liquidity pool', 'impermanent loss', 'mev', 'yield farming', 'amm'];
    const intermediateTerms = ['staking', 'defi', 'nft', 'market cap', 'swap'];
    
    const hasAdvancedTerms = userMessages.some(msg => advancedTerms.some(term => msg.includes(term)));
    const hasIntermediateTerms = userMessages.some(msg => intermediateTerms.some(term => msg.includes(term)));
    
    if (hasAdvancedTerms) return 'advanced';
    if (hasIntermediateTerms) return 'intermediate';
    return 'beginner';
  };

  const handleAIResponse = async (intent: any) => {
    try {
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error("Wallet not connected");
      }

      if (intent.type === "SWAP") {
        if (!intent.fromToken || !intent.toToken) {
          throw new Error("Invalid swap parameters");
        }
        setPendingSwapIntent(intent);
        setAutoExecuteSwap(intent.autoExecute || false);
        setIsConfirmationOpen(true);
      } else if (intent.type === "TRANSFER") {
        if (!intent.recipient || !intent.amount) {
          throw new Error("Invalid transfer parameters");
        }
        setTransferIntent(intent);
        setAutoExecuteTransfer(intent.autoExecute || false);
        setShowTransactionConfirmation(true);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: intent.response || "I understand your request and will process it accordingly.",
        },
      ]);
    } catch (error) {
      console.error("Error in handleAIResponse:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message || "An unexpected error occurred"}. Please try again.`,
        },
      ]);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!transferIntent || !wallet.connected || !wallet.publicKey) {
      console.error("Invalid transfer state or wallet not connected");
      return;
    }

    try {
      setIsExecutingTransfer(true);
      await executeTransfer();
    } catch (error) {
      console.error("Transfer error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Transfer failed: ${error.message || "An unexpected error occurred"}`,
        },
      ]);
    } finally {
      setIsExecutingTransfer(false);
      setShowTransactionConfirmation(false);
      setTransferIntent(null);
    }
  };

  const executeTransfer = async () => {
    if (!transferIntent || !wallet?.connected || !wallet?.publicKey) {
      throw new Error("Invalid transfer state");
    }

    try {
      const result: TransferResponse = await TokenTransferService.transferTokens(
        wallet as WalletContextState,
        transferIntent.token,
        transferIntent.amount,
        transferIntent.recipient
      );

      const successMessage: AIMessage = {
        role: "assistant",
        content: `Transfer successful! Transaction ID: ${result.txId}`,
      };
      setMessages((prev) => [...prev, successMessage]);
    } catch (error) {
      throw new Error(`Transfer failed: ${error.message || "Unknown error"}`);
    }
  };

  const handleSwapSuccess = (result: any) => {
    const successMessage = {
      role: "system",
      content: `✅ ${result.message}`,
    }

    setMessages((prev) => [...prev, successMessage as AIMessage])
    setPendingSwapIntent(null)
    setAutoExecuteSwap(false)
  }

  const handleSwapError = (error: any) => {
    const errorMessage = {
      role: "system",
      content: `❌ ${error.message || "Swap failed. Please try again."}`,
    }

    setMessages((prev) => [...prev, errorMessage as AIMessage])
    setPendingSwapIntent(null)
    setAutoExecuteSwap(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    if (suggestion === "Confirm" && transferIntent) {
      executeTransfer()
      return
    } else if (suggestion === "Cancel" && transferIntent) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Transaction cancelled.",
        },
      ])
      setTransferIntent(null)
      return
    }

    setInput(suggestion)
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.setSelectionRange(suggestion.length, suggestion.length)
    }
    setShouldAutoScroll(true)
  }

  return (
    <>
      <div className="rounded-xl border border-border/40 bg-card shadow-lg transition-all hover:shadow-xl hover:border-primary/20 overflow-hidden backdrop-blur-sm flex flex-col h-full">
        <div className="border-b border-border/40 p-4 flex items-center justify-between bg-card/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <MdIcons.MdSmartToy className="text-primary text-lg" />
            </div>
            <div>
              <h2 className="font-medium">AI Assistant</h2>
              <p className="text-xs text-muted-foreground">
                {wallet.connected && wallet.publicKey ? (
                  `Connected to ${formatWalletAddress(wallet.publicKey.toString())}`
                ) : (
                  "Wallet not connected"
                )}
                {marketDataLoaded && (
                  <span className="ml-2">
                    • Market data: <span className="text-green-500">Live</span>
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setMessages([
                  {
                    role: "assistant",
                    content: "Hi! I'm your Web3 AI assistant. How can I help you with Solana transactions today?",
                  },
                ])
                setShouldAutoScroll(true)
                setShowScrollButton(false)
              }}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Reset conversation"
            >
              <MdIcons.MdRefresh size={20} />
            </button>
          </div>
        </div>

        <div className="relative">
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto h-[calc(100vh-200px)]"
            style={{
              overflowY: "hidden",
            }}
          >
            <div className="pb-4">
              {messages.map((message, index) => (
                <ChatMessage key={index} message={message} isLast={index === messages.length - 1} />
              ))}
              {isProcessing && (
                <div className="py-6 px-6 flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                    <MdIcons.MdSmartToy className="text-primary/80 text-lg" />
                  </div>
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <CustomScrollbar containerRef={chatContainerRef} />
        </div>

        <div className="p-4 border-t border-border/40 bg-card/80">
          <div className="relative flex items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onClick={() => {
                if (!isNearBottom()) {
                  setShouldAutoScroll(false)
                }
              }}
              placeholder="Message AI Wallet Assistant..."
              className="min-h-[44px] max-h-[200px] w-full rounded-lg pl-4 pr-12 py-3 bg-muted resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={isProcessing || input.trim() === ""}
              className={`absolute right-2 bottom-2 p-2 rounded-md transition-colors ${
                isProcessing || input.trim() === "" ? "text-muted-foreground" : "text-primary hover:bg-primary/10"
              }`}
              aria-label="Send message"
            >
              <RxIcons.RxPaperPlane size={18} />
            </button>
          </div>
        </div>

        {pendingSwapIntent && (
          <SwapExecutor
            intent={pendingSwapIntent}
            onSuccess={handleSwapSuccess}
            onError={handleSwapError}
            autoExecute={autoExecuteSwap}
          />
        )}

        {transferIntent?.action === "transfer" && (
          <TransferExecutor
            intent={transferIntent}
            onSuccess={(result) => {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `✅ Transfer successful! ${result.message}${
                    result.explorerUrl ? ` [View on Solana Explorer](${result.explorerUrl})` : ""
                  }`,
                },
              ])
              setTransferIntent(null)
              setAutoExecuteTransfer(false)
            }}
            onError={(error) => {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `❌ Transfer failed: ${error.message || "Please try again."}`,
                },
              ])
              setTransferIntent(null)
              setAutoExecuteTransfer(false)
            }}
            autoExecute={autoExecuteTransfer}
          />
        )}
      </div>

      <TransactionConfirmationModal
        isOpen={showTransactionConfirmation}
        onClose={() => setShowTransactionConfirmation(false)}
        onConfirm={executeTransfer}
        isExecuting={isExecutingTransfer}
        transaction={transaction}
      />

      <style jsx global>{`
        .typing-indicator {
          display: flex;
          align-items: center;
        }

        .typing-indicator span {
          height: 8px;
          width: 8px;
          margin: 0 2px;
          background-color: currentColor;
          border-radius: 50%;
          display: inline-block;
          opacity: 0.4;
        }

        .typing-indicator span:nth-child(1) {
          animation: pulse 1s infinite 0.1s;
        }
        .typing-indicator span:nth-child(2) {
          animation: pulse 1s infinite 0.3s;
        }
        .typing-indicator span:nth-child(3) {
          animation: pulse 1s infinite 0.5s;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.4;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
        }
      `}</style>
    </>
  )
}
