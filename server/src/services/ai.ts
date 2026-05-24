import type { AIAnalysis, SourceType } from '../types.js';

const DEEPSEEK_BASE = 'https://api.deepseek.com';
const MODEL = 'deepseek-v4-flash';

// ========== 关键词类型检测 ==========

type KeywordType = 'stock_code' | 'stock_name' | 'sector' | 'macro_indicator' | 'policy' | 'generic';

const MACRO_INDICATORS = /^(CPI|PPI|GDP|PMI|GNP|GNI|失业率|通胀|就业|利率|汇率|M2|M1|货币供应|美联储|央行|加息|降息|降准|LPR|社融|信贷|进出口|贸易|顺差|逆差|外汇|储备|财政|赤字|国债)/i;

const SECTOR_NAMES = new Set([
  '新能源', '半导体', '芯片', '医药', '白酒', '银行', '地产', '房地产',
  '光伏', '锂电池', '储能', '人工智能', 'AI', '汽车', '军工', '消费',
  '券商', '保险', '煤炭', '钢铁', '有色', '化工', '农业', '电力',
  '新能源车', '新能源汽车', '机器人', '数字经济', '碳中和',
]);

const COMPANY_SUFFIX = /(集团|股份|有限|科技|控股|银行|保险|证券|信托|基金|汽车|医药|地产|能源|钢铁|航空|港口|路桥|水泥|玻璃|纸业|酒业|食品|饮料|服装|家电|电子|通信|软件|网络|传媒|旅游|酒店)/;

function detectKeywordType(keyword: string): KeywordType {
  // A 股代码：6 位数字，以 0/3/6 开头
  if (/^\d{6}$/.test(keyword) && /^[0-36]/.test(keyword)) return 'stock_code';
  // 美股代码：1-5 位纯字母
  if (/^[A-Z]{1,5}$/.test(keyword)) return 'stock_code';
  // 宏观指标
  if (MACRO_INDICATORS.test(keyword)) return 'macro_indicator';
  // 板块/概念
  if (SECTOR_NAMES.has(keyword)) return 'sector';
  // 政策
  if (keyword.includes('政策') || keyword.includes('监管') || keyword.includes('证监会') || keyword.includes('央行')) return 'policy';
  // 公司名：含公司特征后缀
  if (COMPANY_SUFFIX.test(keyword)) return 'stock_name';
  return 'generic';
}

// ========== Query Expansion ==========

const expansionCache = new Map<string, string[]>();

export async function expandKeyword(keyword: string): Promise<string[]> {
  if (expansionCache.has(keyword)) {
    return expansionCache.get(keyword)!;
  }

  const coreTerms = extractCoreTerms(keyword);
  const kwType = detectKeywordType(keyword);

  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'sk-xxx') {
    const result = [keyword, ...coreTerms];
    expansionCache.set(keyword, result);
    return result;
  }

  try {
    const typeHints: Record<KeywordType, string> = {
      stock_code: '如果是股票代码，生成：公司全称、公司简称、英文名、拼音缩写',
      stock_name: '如果是公司名，生成：股票代码、英文名、常见简称、所属板块',
      sector: '如果是板块/概念，生成：板块内最重要的成分股代码（3-8只）、上下游板块名',
      macro_indicator: '如果是经济指标，生成：中英文名称、常见别称、发布机构、关联市场',
      generic: '生成各种写法、中英文对照、常见别称',
    };

    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `你是金融搜索查询扩展专家。给定一个监控关键词，生成变体和关联检索词。

关键词类型：${kwType}
${typeHints[kwType] || typeHints.generic}

规则：
1. 包含原始关键词的各种写法
2. 包含核心组成词
3. 包含常见别称、缩写、中英文对照
4. 不要加入泛化词
5. 总数控制在 5-20 个

输出 JSON 数组，只输出 JSON，不要有其他内容。`,
          },
          { role: 'user', content: keyword },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`DeepSeek API error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    const rawContent = data.choices?.[0]?.message?.content || '';
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const parsed: string[] = JSON.parse(jsonMatch[0]);
      const expanded = [...new Set([keyword, ...coreTerms, ...parsed.map((s) => s.trim()).filter(Boolean)])];
      expansionCache.set(keyword, expanded);
      console.log(`  🔍 Query expansion for "${keyword}": ${expanded.length} variants`);
      return expanded;
    }
  } catch (error) {
    console.error('Query expansion failed:', error);
  }

  const fallback = [keyword, ...coreTerms];
  expansionCache.set(keyword, fallback);
  return fallback;
}

function extractCoreTerms(keyword: string): string[] {
  const terms: string[] = [];
  const parts = keyword.split(/[\s\-_/\\·]+/).filter((p) => p.length >= 2);
  if (parts.length > 1) {
    terms.push(...parts);
    for (let i = 0; i < parts.length - 1; i++) {
      terms.push(parts[i] + ' ' + parts[i + 1]);
    }
  }
  return [...new Set(terms)].filter((t) => t.toLowerCase() !== keyword.toLowerCase());
}

// ========== 关键词预匹配 ==========

export function preMatchKeyword(
  text: string,
  expandedKeywords: string[]
): { matched: boolean; matchedTerms: string[] } {
  const lowerText = text.toLowerCase();
  const matchedTerms: string[] = [];
  for (const kw of expandedKeywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      matchedTerms.push(kw);
    }
  }
  return { matched: matchedTerms.length > 0, matchedTerms };
}

// ========== AI 内容分析 ==========

function buildAnalysisPrompt(
  keyword: string,
  preMatch: { matched: boolean; matchedTerms: string[] },
  sourceType: SourceType
): string {
  const matchHint = preMatch.matched
    ? `内容预匹配发现以下关键词变体：${preMatch.matchedTerms.join('、')}`
    : `内容预匹配未直接提及关键词"${keyword}"的任何变体。注意：在宏观分析和板块研究中，关键词可能不直接出现但存在传导链关联（如美联储加息影响所有资产），请综合判断。`;

  const sourceTypeName =
    sourceType === 'announcement' ? '公告' :
    sourceType === 'macro_data' ? '宏观数据' : '财经资讯';

  const macroHint =
    sourceType === 'macro_data'
      ? `\n宏观数据分析提示：这是宏观数据发布。请判断数据变化方向、幅度和历史对比意义。`
      : '';

  const filingHint =
    sourceType === 'announcement'
      ? `\n公告分析提示：如果这是定期财报（10-K/10-Q/年报/季报），请重点关注与上一期披露的差异部分（如业绩同比变化、风险因素变更、分部重组、商誉减值等），而不是重复已知信息。如果这是修正案（8-K/A），请判断修正内容是否实质性。`
      : '';

  return `你是金融信息分析专家。请分析以下${sourceTypeName}内容与监控关键词「${keyword}」的相关性和重要性。

${matchHint}${macroHint}${filingHint}

## 分析要求

### 1. 事件类型识别（eventType）
请判断这属于什么类型的事件，必须从以下列表中选择：
- 公司事件：earnings（财报）、earnings_guidance（业绩指引）、executive_change（高管变更）、ma（并购重组）、equity_change（股权变动）、financing（再融资）、dividend（分红）、lawsuit（诉讼）、regulatory（监管处罚）、product（产品突破）、contract（重大合同）、shareholder_meeting（股东大会）、routine（例行公告）
- 宏观事件：macro_data（宏观数据）、monetary_policy（货币政策）、fiscal_policy（财政政策）、trade_policy（贸易政策）
- 市场事件：market_movement（市场异动）、analyst_rating（研报评级）、institutional（机构持仓）
- 其他：industry_policy（行业政策）、other

### 2. 实质判断（isSubstantial）
判断内容是否包含实质信息：
- true：有实质性内容（如具体数字、具体决策、具体影响）
- false：例行公告、历史回顾、无实质内容的泛泛而谈
定期财报（年报/季报/10-K/10-Q）默认为实质，除非是纯提示性信息。

### 3. 相关性评分（relevance，0-100）
- 90-100：直接且核心相关（如公司本身的重大公告）
- 70-89：直接相关（如行业政策影响该板块）
- 50-69：间接相关（如宏观经济影响整个市场，该公司也受影响）
- 30-49：弱相关（同一产业链但影响很小）
- 0-29：几乎无关

如果关键词是板块名，板块内公司的重大事件应给 80+ 分。
如果关键词是宏观指标，该数据发布本身应给 95+ 分。
如果内容只是"同一领域但未提及关键词"，relevance 应低于 40 分。

### 4. 关键词提及（keywordMentioned）
内容中是否直接提及了关键词或其等价表述。

### 5. 重要性分级（importance）
综合事件类型和影响程度判断：
- high：明显影响持仓决策（如并购、高管变更、业绩暴雷、监管处罚、货币政策变化）
- medium：需要关注但不一定立即行动（如定期财报、行业政策、再融资）
- low：了解即可（如例行公告、历史回顾、无关痛痒的小新闻）

判断依据：事件类型的基础重要性 + 涉及金额大小 + 影响范围 + 突发性。

### 6. 核心事实摘要（summary）
用一句话中文说明"发生了什么"，要求包含关键数字（如有），说明事件对关键词实体的直接影响，不超过 50 字。

### 7. 是否影响持仓（affectedHoldings）
判断此事件是否可能导致投资者调整持仓（买入/卖出/加仓/减仓）。

### 8. 事件指纹（eventFingerprint）
生成一个简短的事件指纹，用于识别同一事件的多源报道。格式：公司名_事件类型_关键数字（如"宁德时代_投资_50亿"）。

## 输出格式
请以 JSON 格式输出，只输出 JSON，不要有其他内容：
{
  "eventType": "事件类型",
  "isSubstantial": true/false,
  "relevance": 0-100,
  "relevanceReason": "相关性打分理由",
  "keywordMentioned": true/false,
  "importance": "low/medium/high",
  "importanceReason": "重要性分级理由",
  "summary": "核心事实摘要",
  "affectedHoldings": true/false,
  "eventFingerprint": "事件指纹"
}`;
}

export async function analyzeContent(
  content: string,
  keyword: string,
  preMatch?: { matched: boolean; matchedTerms: string[] },
  sourceType: SourceType = 'news'
): Promise<AIAnalysis> {
  const matchResult = preMatch ?? { matched: false, matchedTerms: [] };

  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'sk-xxx') {
    return {
      eventType: 'other',
      isSubstantial: matchResult.matched,
      relevance: matchResult.matched ? 40 : 10,
      relevanceReason: '未配置 DeepSeek API Key',
      keywordMentioned: matchResult.matched,
      importance: 'low',
      importanceReason: '未配置 AI 服务',
      summary: content.slice(0, 80),
      affectedHoldings: false,
      eventFingerprint: '',
    };
  }

  try {
    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildAnalysisPrompt(keyword, matchResult, sourceType) },
          { role: 'user', content: content.slice(0, 3000) },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`DeepSeek API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const rawContent: string = data.choices?.[0]?.message?.content || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        eventType: String(parsed.eventType || 'other'),
        isSubstantial: Boolean(parsed.isSubstantial),
        relevance: Math.min(100, Math.max(0, Number(parsed.relevance) || 0)),
        relevanceReason: String(parsed.relevanceReason || '').slice(0, 200),
        keywordMentioned: Boolean(parsed.keywordMentioned),
        importance: ['low', 'medium', 'high'].includes(parsed.importance) ? parsed.importance : 'low',
        importanceReason: String(parsed.importanceReason || '').slice(0, 200),
        summary: String(parsed.summary || '').slice(0, 200),
        affectedHoldings: Boolean(parsed.affectedHoldings),
        eventFingerprint: String(parsed.eventFingerprint || '').slice(0, 200),
      };
    }

    throw new Error('Failed to parse AI response JSON');
  } catch (error) {
    console.error('AI analysis failed:', error);
    return {
      eventType: 'other',
      isSubstantial: matchResult.matched,
      relevance: matchResult.matched ? 30 : 10,
      relevanceReason: 'AI 分析失败，使用默认分数',
      keywordMentioned: matchResult.matched,
      importance: 'low',
      importanceReason: 'AI 分析失败',
      summary: content.slice(0, 80),
      affectedHoldings: false,
      eventFingerprint: '',
    };
  }
}

// ========== 批量分析 ==========

export async function batchAnalyze(
  contents: string[],
  keyword: string,
  expandedKeywords?: string[],
  sourceType: SourceType = 'news'
): Promise<AIAnalysis[]> {
  const results: AIAnalysis[] = [];
  const batchSize = 3;

  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((content) => {
        const preMatch = expandedKeywords
          ? preMatchKeyword(content, expandedKeywords)
          : undefined;
        return analyzeContent(content, keyword, preMatch, sourceType);
      })
    );
    results.push(...batchResults);
  }

  return results;
}
