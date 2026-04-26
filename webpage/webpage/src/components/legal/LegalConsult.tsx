import { useMemo, useState } from 'react';
import { AlertCircle, Bot, Eraser, SendHorizonal, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LEGAL_CONSULT_SYSTEM_PROMPT } from '@/lib/legalPrompts';
import { chatWithMiniMaxStream, hasMiniMaxApiKey, type MiniMaxMessage } from '@/lib/minimax';

type ChatMessage = MiniMaxMessage & {
  id: string;
};

const EMPTY_TIPS = [
  '承运商约定赔偿上限 500 美元/票，但我司对客户未限责，这种条款风险怎么改？',
  '越南段由第三方承运，合同里怎样写才能保证我方能向分包商追偿？',
  '客户签收后才发现货损，举证责任和验货规则怎样约定更有利？',
];

const LegalConsult = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const placeholder = useMemo(() => {
    if (!hasMiniMaxApiKey()) {
      return '请先配置 VITE_NVIDIA_API_KEY 后再发起咨询';
    }

    return '请输入合同、货损赔偿、分包责任或跨境运输争议相关问题';
  }, []);

  const handleSend = async () => {
    const question = input.trim();

    if (!question) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: question,
    };

    const nextMessages = [...messages, userMessage];
    const assistantMessageId = `${Date.now()}-assistant`;
    const streamingAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    };

    setMessages([...nextMessages, streamingAssistantMessage]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const response = await chatWithMiniMaxStream([
        { role: 'system', content: LEGAL_CONSULT_SYSTEM_PROMPT },
        ...nextMessages.map(({ role, content }) => ({ role, content })),
      ], (chunk) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: message.content + chunk }
              : message
          )
        );
      });

      const finalContent = response || 'MiniMax 已返回，但内容为空。建议补充更多事实后重试。';
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: finalContent }
            : message
        )
      );
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : '法律咨询失败，请稍后重试。';
      setMessages((current) => current.filter((item) => item.id !== assistantMessageId));
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError('');
    setInput('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="border-primary/10 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>法律咨询</CardTitle>
          <CardDescription>保留完整上下文历史，优先回答物流合同、货损赔偿、分包责任和跨境运输争议问题。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>请求失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <ScrollArea className="h-[560px] rounded-lg border bg-background">
            <div className="flex flex-col gap-4 p-4">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">
                  还没有咨询记录。可以直接提问承运赔偿上限、分包追偿条款、货损举证责任或争议解决条款风险。
                </div>
              ) : (
                messages.map((message) => {
                  const isAssistant = message.role === 'assistant';

                  return (
                    <div key={message.id} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`flex max-w-[85%] gap-3 rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
                          isAssistant
                            ? 'border bg-card text-card-foreground'
                            : 'bg-primary text-primary-foreground'
                        }`}
                      >
                        <div className="pt-0.5">
                          {isAssistant ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        </div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  );
                })
              )}

            </div>
          </ScrollArea>

          <div className="flex gap-3">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!loading) {
                    void handleSend();
                  }
                }
              }}
              placeholder={placeholder}
              disabled={loading || !hasMiniMaxApiKey()}
            />
            <Button onClick={handleSend} disabled={!input.trim() || !hasMiniMaxApiKey()} loading={loading}>
              <SendHorizonal className="h-4 w-4" />
              发送
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>咨询辅助</CardTitle>
              <CardDescription>建议尽量带上合同角色、运输区段、责任条款和争议事实。</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleClear} disabled={messages.length === 0 && !input}>
              <Eraser className="h-4 w-4" />
              清空对话
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {EMPTY_TIPS.map((tip) => (
            <button
              type="button"
              key={tip}
              className="rounded-lg border bg-background px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              onClick={() => setInput(tip)}
            >
              {tip}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default LegalConsult;
