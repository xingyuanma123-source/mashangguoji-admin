-- staging seed —— 仅配置 + 参考数据，无真实业务数据 / 无 prod 凭证
-- 由 prod 只读导出（fee_types/deadline_rules/playbook_rules/operating_companies + storage.buckets）

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: deadline_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.deadline_rules (id, rule_key, description, base_event, duration_days, legal_basis) OVERRIDING SYSTEM VALUE VALUES (1, 'general_civil_claim', '普通民事请求权诉讼时效（含国内公路货损索赔、运费请求权）', '知道或应当知道权利受到损害以及义务人之日', 1095, '《民法典》第 188 条（3 年）');
INSERT INTO public.deadline_rules (id, rule_key, description, base_event, duration_days, legal_basis) OVERRIDING SYSTEM VALUE VALUES (2, 'intl_sea_cargo_claim', '海上货物运输向承运人索赔时效', '承运人交付或应当交付货物之日', 365, '《海商法》第 257 条（1 年）');
INSERT INTO public.deadline_rules (id, rule_key, description, base_event, duration_days, legal_basis) OVERRIDING SYSTEM VALUE VALUES (3, 'air_cargo_claim', '航空货物运输索赔诉讼时效', '民用航空器到达目的地点之日/应当到达之日', 730, '《民用航空法》第 135 条（2 年）');
INSERT INTO public.deadline_rules (id, rule_key, description, base_event, duration_days, legal_basis) OVERRIDING SYSTEM VALUE VALUES (4, 'multimodal_claim', '多式联运经营人索赔（涉海运区段）', '交付或应当交付货物之日', 365, '《海商法》第 257 条参照适用');
INSERT INTO public.deadline_rules (id, rule_key, description, base_event, duration_days, legal_basis) OVERRIDING SYSTEM VALUE VALUES (5, 'cargo_damage_notice_hidden', '隐蔽货损书面异议期（合同约定型，默认值）', '货物签收之日', 7, '合同约定（公司模板：约定期限内可提异议）');


--
-- Data for Name: fee_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (1, 'fee_weighing', '过磅费', 1, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (2, 'fee_container', '提柜费', 2, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (3, 'fee_overnight', '过夜费', 3, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (4, 'fee_vn_overtime', '越南超时费', 4, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (5, 'fee_vn_key', '越南收钥匙', 5, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (6, 'fee_parking', '停车费', 6, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (7, 'fee_newpost', '新岗', 7, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (8, 'fee_taxi', '打车', 8, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (9, 'fee_water', '淋水', 9, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (10, 'fee_tarpaulin', '解篷布', 10, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (11, 'fee_highway', '高速费', 11, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (12, 'fee_stamp', '盖章', 12, true);
INSERT INTO public.fee_types (id, field_name, display_name, sort_order, is_active) VALUES (13, 'other', '其他', 13, true);


--
-- Data for Name: operating_companies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (1, '广西马上国际货运代理有限公司', '马上国际', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (2, '广西马上供应链管理服务有限公司', '马上供应链', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (3, '广西通泽国际物流有限公司', '通泽国际', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (4, '凭祥市瑞鑫源物流中心', '瑞鑫源', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (5, '凭祥市曌熙物流中心(个体工商户)', '曌熙物流', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (6, '南宁市西乡塘区张雪群货运服务部(个体工商户)', '张雪群货运', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (7, '烟台春天物流有限公司（马上资产）', '烟台春天', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (8, '日照德瑞物流有限公司', '日照德瑞', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (9, '马鑫鑫', '马鑫鑫', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (10, '滁州市亨运物流有限公司', '滁州亨运', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (11, '深圳市新圳国际物流有限公司', '深圳新圳', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (12, '深圳市永发兴物流有限公司', '深圳永发兴', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (13, '深圳市湘运国际物流有限公司', '深圳湘运', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (14, '深圳鲲亿达国际物流有限公司', '深圳鲲亿达', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (15, '濮阳市中通运输有限公司', '濮阳中通', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (16, '广西壹路通国际物流有限公司', '壹路通', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (17, '广州吉捷汽车运输有限公司', '广州吉捷', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (18, '南京兵鑫物流有限公司', '南京兵鑫', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (19, '大连顺顺达运输有限公司', '大连顺顺达', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (20, '新余市光大汽车运输有限公司', '新余光大', true, '2026-04-26 11:22:35.506411+00');
INSERT INTO public.operating_companies (id, name, short_name, is_active, created_at) VALUES (21, '广西南向跨境运输有限公司', '广西南向', true, '2026-04-26 11:22:35.506411+00');


--
-- Data for Name: playbook_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (1, 'transport', 'liability', '分包商/承运方赔偿不以运费为限，覆盖货值损失、客户索赔款、重运费用、仓储费用、律师费及其他合理支出', '赔偿上限不低于我方对客户已承担或应承担的赔偿责任', '出现"赔偿以运费（或其 X 倍）为限"条款', '乙方的赔偿责任不以运费金额为限，不得低于甲方对客户已承担或应承担的赔偿责任。', '强调跨境链路中我方对客户先行担责，限额条款将导致风险敞口完全失衡', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (2, 'transport', 'subcontract', '禁止擅自分包；经书面同意分包的，对分包方行为承担连带责任', '允许报备制分包，但保留连带责任', '允许自由分包且不承担连带责任', '未经甲方书面同意，乙方不得擅自分包。经同意分包的，乙方仍对分包方行为承担连带责任。', '以越南段/东南亚段多层分包的实际风险说明连带责任的必要性', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (3, 'transport', 'force_majeure', '不可抗力限于不可预见、不可避免、不可克服的客观事件；拥堵、常规清关延迟、调度异常、油价波动、分包商违约均不构成', '可接受列举式不可抗力，但必须明确排除上述情形', '宽泛不可抗力定义（含拥堵/清关延迟）', '人员不足、车辆调度异常、分包商违约、常规拥堵、普通清关延迟、燃油价格波动等均不构成不可抗力。', '清关延迟是跨境物流常态成本，纳入不可抗力等于免除对方主要义务', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (4, 'transport', 'evidence', '事故 24 小时内书面通知并提交照片、视频、签收记录、异常说明；逾期举证不利由对方承担', '48 小时通知期', '无证据义务条款', '乙方应在事故发生后 24 小时内书面通知甲方并提交现场照片、视频、签收记录、异常说明；未按时提交的，由此导致的举证不利后果由乙方承担。', '证据时效直接决定追偿成败，这是不可让步的程序条款', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (5, 'transport', 'receipt', '签收不当然免责；隐蔽货损、数量短少可在约定期限内提出异议', '异议期不少于 7 天', '"签收即视为无异议"条款', '收货人签收不视为乙方当然免责；隐蔽货损、数量短少等情形仍可在约定期限内提出异议。', '集装箱/整车运输中隐蔽货损普遍，签收免责条款会架空索赔权', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (6, 'transport', 'recourse', '我方有权先行赔付客户后向责任方追偿，责任方应在通知后 5 个工作日内支付', '10 个工作日支付期', '追偿以法院判决为前提', '如客户直接向甲方索赔，甲方有权先行赔付后向乙方追偿，乙方应在收到通知后 5 个工作日内支付。', '以诉讼为前提的追偿条款会把每单纠纷拖成年度诉讼', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (7, 'transport', 'jurisdiction', '争议由我方所在地人民法院管辖', '合同签订地法院', '对方所在地法院或不利仲裁机构', '因本协议产生的争议，由甲方所在地人民法院管辖。', '跨省/跨境应诉成本高，管辖条款是隐性成本条款', true, '2026-06-11 06:11:50.765191+00');
INSERT INTO public.playbook_rules (id, contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip, is_active, updated_at) OVERRIDING SYSTEM VALUE VALUES (8, 'transport', 'payment', '月结对账 + 发票合规开具时限 + 逾期付款违约金', '可接受 45 天账期', '背靠背付款（客户付款为我方付款前提）', '运费按月对账结算；逾期付款的，每日按未付金额 0.05% 支付违约金。', '背靠背条款将客户信用风险转嫁给我方供应链，原则不接受', true, '2026-06-11 06:11:50.765191+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('vehicle-documents', 'vehicle-documents', NULL, '2026-04-27 03:13:08.566248+00', '2026-04-27 03:13:08.566248+00', false, false, 5242880, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD');
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('driver-documents', 'driver-documents', NULL, '2026-04-27 03:13:08.566248+00', '2026-04-27 03:13:08.566248+00', false, false, 5242880, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD');
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('app-a2kae62wkbnl_receipt_images', 'app-a2kae62wkbnl_receipt_images', NULL, '2026-03-11 18:14:40.603621+00', '2026-03-11 18:14:40.603621+00', false, false, NULL, NULL, NULL, 'STANDARD');
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('receipt-images', 'receipt-images', NULL, '2026-04-14 17:40:48.72452+00', '2026-04-14 17:40:48.72452+00', false, false, NULL, NULL, NULL, 'STANDARD');
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('contracts', 'contracts', NULL, '2026-06-11 01:47:37.167858+00', '2026-06-11 01:47:37.167858+00', false, false, NULL, NULL, NULL, 'STANDARD');
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('legal-library', 'legal-library', NULL, '2026-06-11 01:47:37.167858+00', '2026-06-11 01:47:37.167858+00', false, false, NULL, NULL, NULL, 'STANDARD');


--
-- Name: deadline_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.deadline_rules_id_seq', 5, true);


--
-- Name: fee_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.fee_types_id_seq', 14, true);


--
-- Name: operating_companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.operating_companies_id_seq', 21, true);


--
-- Name: playbook_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.playbook_rules_id_seq', 8, true);


--
-- PostgreSQL database dump complete
--



-- pg_cron：vehicle_locations 每小时清理（保留 1 天）
select cron.schedule('cleanup_vehicle_locations', '0 * * * *', $$DELETE FROM public.vehicle_locations WHERE gps_time < NOW() - INTERVAL '1 day'$$);

-- 测试员工账号（staging 专用，用户名 test / 密码 staging-test-2026）
insert into public.service_staff (id, username, password, name, role) values
  (1, 'test', '$2a$10$D7UBBGLeJfTe9LzP10q1BOJ7Dlp61/1NGy6j4aceud4qlbzArnb52', '测试管理员', 'admin');
