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
import { useTranslation } from 'react-i18next';

type ChatMessage = MiniMaxMessage & {
  id: string;
};

const LegalConsult = () => {
  const { t } = useTranslation();
  const emptyTips = [
    t('legal.tips.liabilityCap'),
    t('legal.tips.subcontractRecourse'),
    t('legal.tips.cargoDamageEvidence'),
  ];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const placeholder = useMemo(() => {
    if (!hasMiniMaxApiKey()) {
      return t('legal.consultPlaceholderNoKey');
    }

    return t('legal.consultPlaceholder');
  }, [t]);

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

      const finalContent = response || t('legal.emptyConsultResult');
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: finalContent }
            : message
        )
      );
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : t('legal.consultFailed');
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
          <CardTitle>{t('legal.legalConsult')}</CardTitle>
          <CardDescription>{t('legal.consultDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('legal.requestFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <ScrollArea className="h-[560px] rounded-lg border bg-background">
            <div className="flex flex-col gap-4 p-4">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">
                  {t('legal.noConsult')}
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
              {t('legal.send')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{t('legal.assistant')}</CardTitle>
              <CardDescription>{t('legal.assistantDescription')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleClear} disabled={messages.length === 0 && !input}>
              <Eraser className="h-4 w-4" />
              {t('legal.clearChat')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {emptyTips.map((tip) => (
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
