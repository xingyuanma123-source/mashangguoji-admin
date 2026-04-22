import MainLayout from '@/components/layouts/MainLayout';
import ContractReview from '@/components/legal/ContractReview';
import ContractTemplates from '@/components/legal/ContractTemplates';
import LegalConsult from '@/components/legal/LegalConsult';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText } from 'lucide-react';

const LegalPage = () => {
  return (
    <MainLayout>
      <div className="space-y-6">
        <Card className="overflow-hidden border-primary/10 bg-gradient-to-r from-[#0f2a5e] via-[#16408a] to-[#1b4fa6] text-white shadow-sm">
          <CardContent className="flex flex-col gap-4 px-6 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">合同法务</h1>
                <p className="mt-1 text-sm text-white/80">
                  面向马上国际的跨境物流业务场景，聚焦合同审查、经营风险判断和模板复用。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-white/15 text-white hover:bg-white/15">MiniMax 驱动</Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/15">跨境物流风险视角</Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/15">合同模板内置</Badge>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="contract-review" className="space-y-4">
          <TabsList className="bg-primary/5">
            <TabsTrigger value="contract-review">合同审查</TabsTrigger>
            <TabsTrigger value="legal-consult">法律咨询</TabsTrigger>
            <TabsTrigger value="contract-templates">合同模板</TabsTrigger>
          </TabsList>

          <TabsContent value="contract-review">
            <ContractReview />
          </TabsContent>
          <TabsContent value="legal-consult">
            <LegalConsult />
          </TabsContent>
          <TabsContent value="contract-templates">
            <ContractTemplates />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default LegalPage;
