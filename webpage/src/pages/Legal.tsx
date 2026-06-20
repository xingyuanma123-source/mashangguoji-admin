import { Navigate, useLocation, useSearchParams } from 'react-router-dom';

// 「AI 法务咨询」已并入法务 Agent 工作台（图片 OCR 提问、文件库依据均由 Agent 承接）。
// 保留本路由用于兼容旧链接：/legal?docId=N → /legal/agent?docId=N
const LegalPage = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const legacyTab = searchParams.get('tab');

  if (legacyTab === 'contract-review') return <Navigate to="/legal/contracts" replace />;
  if (legacyTab === 'contract-templates') return <Navigate to="/legal/library" replace />;
  return <Navigate to={`/legal/agent${location.search}`} replace />;
};

export default LegalPage;
