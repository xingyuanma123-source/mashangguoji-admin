import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { MAX_IMAGES_PER_MESSAGE, recognizeImage, validateImageFile } from '@/lib/ocr';

export interface OcrAttachment {
  id: string;
  file: File;
  previewUrl: string;
  status: 'recognizing' | 'done' | 'failed';
  text?: string;
  error?: string;
}

// 图片/PDF 附件 + OCR 识别，识别文本随消息注入 agent（沿用原 AI 法务咨询的能力）
export function useOcrAttachments() {
  const [attachments, setAttachments] = useState<OcrAttachment[]>([]);
  const attachmentsRef = useRef<OcrAttachment[]>([]);

  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => () => { attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)); }, []);

  const addFiles = useCallback((files: File[] | FileList) => {
    const list = Array.from(files);
    const slots = MAX_IMAGES_PER_MESSAGE - attachmentsRef.current.length;
    if (list.length > slots) toast.error(`一次最多 ${MAX_IMAGES_PER_MESSAGE} 个附件`);
    for (const file of list.slice(0, Math.max(0, slots))) {
      const validation = validateImageFile(file);
      if (validation) {
        toast.error(validation === 'too_large' ? `${file.name} 超过大小限制` : `${file.name} 格式不支持（仅图片/PDF）`);
        continue;
      }
      const attachment: OcrAttachment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'recognizing',
      };
      setAttachments((current) => [...current, attachment]);
      void recognizeImage(file)
        .then((result) => {
          const text = result.text.trim();
          setAttachments((current) => current.map((item) => item.id === attachment.id
            ? { ...item, status: text ? 'done' : 'failed', text, error: text ? undefined : '未识别到文字' }
            : item));
        })
        .catch((error) => {
          setAttachments((current) => current.map((item) => item.id === attachment.id
            ? { ...item, status: 'failed', error: error instanceof Error ? error.message : '识别失败' }
            : item));
        });
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setAttachments([]);
  }, []);

  const recognizing = attachments.some((item) => item.status === 'recognizing');

  // 把识别文本与问题拼成发给 agent 的完整消息
  const composeMessage = useCallback((question: string) => {
    const recognized = attachmentsRef.current.filter((item) => item.status === 'done' && item.text);
    if (recognized.length === 0) return question;
    const blocks = recognized
      .map((item, index) => `--- 附件 ${index + 1}（${item.file.name}）OCR 识别内容 ---\n${item.text}`)
      .join('\n\n');
    return `【用户上传了 ${recognized.length} 个附件，识别内容如下】\n\n${blocks}\n\n【用户问题】\n${question || '请分析以上附件内容'}`;
  }, []);

  return { attachments, addFiles, removeAttachment, clearAttachments, recognizing, composeMessage };
}
