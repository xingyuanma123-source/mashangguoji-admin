import { useMemo, useState } from 'react';
import { AlertCircle, FileText, ShieldAlert, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildContractReviewUserPrompt, CONTRACT_REVIEW_SYSTEM_PROMPT } from '@/lib/legalPrompts';
import { parseLegalFile, type ParsedLegalFile } from '@/lib/fileParsers';
import { chatWithMiniMax } from '@/lib/minimax';

function getRiskLevel(content: string) {
  const matched = content.match(/总体风险评级[：:\s]*([高中低])/);
  return matched?.[1] ?? null;
}

function getRiskBadgeVariant(level: string | null): 'destructive' | 'secondary' | 'outline' {
  if (level === '高') {
    return 'destructive';
  }

  if (level === '中') {
    return 'secondary';
  }

  return 'outline';
}

const ContractReview = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedLegalFile | null>(null);
  const [reviewResult, setReviewResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const riskLevel = useMemo(() => getRiskLevel(reviewResult), [reviewResult]);

  const handleFileChange = async (file: File | null) => {
    setSelectedFile(file);
    setParsedFile(null);
    setReviewResult('');
    setError('');

    if (!file) {
      return;
    }

    try {
      const parsed = await parseLegalFile(file);
      setParsedFile(parsed);
      toast.success('合同正文解析完成');
    } catch (fileError) {
      const message = fileError instanceof Error ? fileError.message : '文件解析失败，请重试。';
      setError(message);
      toast.error(message);
    }
  };

  const handleReview = async () => {
    if (!selectedFile) {
      const message = '请先上传需要审查的合同文件。';
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    setError('');
    setReviewResult('');

    try {
      const parsed = parsedFile ?? (await parseLegalFile(selectedFile));
      setParsedFile(parsed);

      const response = await chatWithMiniMax([
        { role: 'system', content: CONTRACT_REVIEW_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildContractReviewUserPrompt({
            fileName: parsed.fileName,
            fileTypeLabel: parsed.fileTypeLabel,
            originalLength: parsed.originalLength,
            truncatedLength: parsed.truncatedLength,
            text: parsed.text,
          }),
        },
      ]);

      const finalResult = response || 'MiniMax 已返回，但内容为空。建议稍后重试，或缩短合同内容后再次审查。';
      setReviewResult(finalResult);
      toast.success('合同审查完成');
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : '合同审查失败，请稍后重试。';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            合同上传
          </CardTitle>
          <CardDescription>支持 PDF、DOCX 文件。解析后将从马上国际的经营风险角度进行审查。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label
            htmlFor="legal-contract-file"
            className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-6 text-center transition hover:border-primary/50 hover:bg-primary/10"
          >
            <UploadCloud className="mb-3 h-8 w-8 text-primary" />
            <div className="text-sm font-medium text-foreground">点击选择合同文件</div>
            <div className="mt-1 text-xs text-muted-foreground">建议上传可复制文本的 PDF 或 DOCX 文档</div>
            <input
              id="legal-contract-file"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </label>

          {selectedFile ? (
            <div className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{selectedFile.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {parsedFile
                      ? `已解析 ${parsedFile.originalLength} 字${parsedFile.originalLength > parsedFile.truncatedLength ? `，提交模型 ${parsedFile.truncatedLength} 字` : ''}`
                      : '等待解析或重新解析'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              尚未选择合同文件
            </div>
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>处理失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button onClick={handleReview} loading={loading} loadingText="审查中...">
            开始审查
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              审查结果
            </CardTitle>
            {riskLevel ? <Badge variant={getRiskBadgeVariant(riskLevel)}>总体风险评级：{riskLevel}</Badge> : null}
          </div>
          <CardDescription>审查输出会优先聚焦赔偿责任敞口、分包追偿链条、货损举证和争议解决等风险。</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              正在解析合同并提交 MiniMax 审查，请稍候...
            </div>
          ) : reviewResult ? (
            <ScrollArea className="h-[620px] rounded-lg border bg-background">
              <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-7 text-foreground">{reviewResult}</div>
            </ScrollArea>
          ) : (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              上传合同后点击“开始审查”，这里会展示总体风险评级、关键风险点、原文摘录、修改建议和法务复核事项。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ContractReview;
