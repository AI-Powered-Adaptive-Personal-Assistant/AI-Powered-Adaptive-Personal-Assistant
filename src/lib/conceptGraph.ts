/**
 * Concept & Knowledge Graph with Prerequisite Root-Cause Diagnosis (Points 6 & 31)
 * Models hierarchical concepts, dependencies, and enables the Intelligent Tutor
 * to diagnose whether a student's failure in an advanced topic stems from an
 * unmastered prerequisite.
 */

export interface ConceptNode {
  id: string;
  nameEn: string;
  nameAr: string;
  domain: 'computer_science' | 'mathematics' | 'science' | 'general';
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  prerequisites: string[];
  descriptionEn: string;
  descriptionAr: string;
}

export interface PrerequisiteDiagnosis {
  hasPrerequisiteGap: boolean;
  targetConceptId: string;
  rootGapConcept?: ConceptNode;
  explanationEn: string;
  explanationAr: string;
}

export const CONCEPT_REGISTRY: Record<string, ConceptNode> = {
  // Computer Science Knowledge Graph
  variables_types: {
    id: 'variables_types',
    nameEn: 'Variables & Data Types',
    nameAr: 'المتغيرات وأنواع البيانات',
    domain: 'computer_science',
    difficultyTier: 1,
    prerequisites: [],
    descriptionEn: 'Basic primitives, declarations, and memory allocation.',
    descriptionAr: 'المتغيرات الأساسية وأنواعها وتخزينها في الذاكرة.',
  },
  control_flow: {
    id: 'control_flow',
    nameEn: 'Control Flow (Conditionals & Loops)',
    nameAr: 'التحكم في المسار (الشروط والحلقات)',
    domain: 'computer_science',
    difficultyTier: 1,
    prerequisites: ['variables_types'],
    descriptionEn: 'If-else statements, switch cases, and for/while iteration.',
    descriptionAr: 'جمل الشرط والتكرار في البرمجة.',
  },
  functions: {
    id: 'functions',
    nameEn: 'Functions & Scope',
    nameAr: 'الدوال ونطاق المتغيرات',
    domain: 'computer_science',
    difficultyTier: 2,
    prerequisites: ['control_flow'],
    descriptionEn: 'Parameters, return values, call stack, and variable scope.',
    descriptionAr: 'تمرير المعاملات، القيم المرجعة، ونطاق الرؤية.',
  },
  memory_addresses: {
    id: 'memory_addresses',
    nameEn: 'Memory Addresses & Hexadecimal',
    nameAr: 'عناوين الذاكرة والترقيم الست عشري',
    domain: 'computer_science',
    difficultyTier: 2,
    prerequisites: ['variables_types'],
    descriptionEn: 'Physical and virtual memory layout and RAM addresses.',
    descriptionAr: 'هيكلة الذاكرة وكيفية عنونة البيانات داخل الرام.',
  },
  pointers: {
    id: 'pointers',
    nameEn: 'Pointers & Dereferencing',
    nameAr: 'المؤشرات والوصول المباشر (Dereferencing)',
    domain: 'computer_science',
    difficultyTier: 3,
    prerequisites: ['memory_addresses', 'variables_types'],
    descriptionEn: 'Pointer variables, address-of operator (&), and dereference (*).',
    descriptionAr: 'تخزين عناوين الذاكرة والتعامل مع المؤشرات وعامل فك الإشارة.',
  },
  heap_stack: {
    id: 'heap_stack',
    nameEn: 'Stack vs. Heap Memory',
    nameAr: 'ذاكرة المكدس (Stack) مقابل الركام (Heap)',
    domain: 'computer_science',
    difficultyTier: 3,
    prerequisites: ['memory_addresses', 'functions'],
    descriptionEn: 'Automatic lifetime (stack) vs. manual allocation (heap).',
    descriptionAr: 'الفرق بين تخصيص الذاكرة التلقائي في Stack والتخصيص الحر في Heap.',
  },
  dynamic_memory: {
    id: 'dynamic_memory',
    nameEn: 'Dynamic Memory Allocation (malloc / new / free)',
    nameAr: 'تخصيص الذاكرة الديناميكية',
    domain: 'computer_science',
    difficultyTier: 4,
    prerequisites: ['pointers', 'heap_stack'],
    descriptionEn: 'Runtime allocation, pointer casting, and avoiding memory leaks.',
    descriptionAr: 'حجز الذاكرة أثناء وقت التشغيل، وتفادي تسريب الذاكرة (Memory Leaks).',
  },
  recursion: {
    id: 'recursion',
    nameEn: 'Recursion & Call Stack Depth',
    nameAr: 'الاستدعاء الذاتي ومكدس النداء',
    domain: 'computer_science',
    difficultyTier: 3,
    prerequisites: ['functions'],
    descriptionEn: 'Base cases, recursive steps, and stack overflow avoidance.',
    descriptionAr: 'الحالات الأساسية، خطوات العودية، ومنع امتلاء المكدس.',
  },
  data_structures_linear: {
    id: 'data_structures_linear',
    nameEn: 'Linear Data Structures (Linked Lists, Queues)',
    nameAr: 'هياكل البيانات الخطية (القوائم المترابطة)',
    domain: 'computer_science',
    difficultyTier: 4,
    prerequisites: ['dynamic_memory', 'pointers'],
    descriptionEn: 'Nodes, head/tail pointers, insertion, and traversal.',
    descriptionAr: 'ربط العقد البرمجية عبر المؤشرات وعمليات الإضافة والحذف.',
  },
  asymptotic_complexity: {
    id: 'asymptotic_complexity',
    nameEn: 'Asymptotic Complexity (Big-O Notation)',
    nameAr: 'التعقيد الحسابي (Big-O)',
    domain: 'computer_science',
    difficultyTier: 3,
    prerequisites: ['control_flow', 'functions'],
    descriptionEn: 'Time and space complexity analysis for algorithms.',
    descriptionAr: 'تحليل زمن التنفيذ واستهلاك الذاكرة للخوارزميات.',
  },

  // Mathematics Knowledge Graph
  basic_algebra: {
    id: 'basic_algebra',
    nameEn: 'Basic Algebra & Equations',
    nameAr: 'الجبر والمعادلات الرياضية الأساسية',
    domain: 'mathematics',
    difficultyTier: 1,
    prerequisites: [],
    descriptionEn: 'Solving linear equations and variable manipulation.',
    descriptionAr: 'حل المعادلات الخطية وتبسيط المقادير الجبرية.',
  },
  functions_graphs: {
    id: 'functions_graphs',
    nameEn: 'Functions & Coordinate Graphs',
    nameAr: 'الدوال الرياضية والتمثيل البياني',
    domain: 'mathematics',
    difficultyTier: 2,
    prerequisites: ['basic_algebra'],
    descriptionEn: 'Domains, ranges, and graphical interpretations of functions.',
    descriptionAr: 'المجال والمدى والتمثيل البياني في المستوى الإحداثي.',
  },
  limits_continuity: {
    id: 'limits_continuity',
    nameEn: 'Limits & Continuity',
    nameAr: 'النهايات والاتصال',
    domain: 'mathematics',
    difficultyTier: 3,
    prerequisites: ['functions_graphs'],
    descriptionEn: 'Approaching values, asymptotes, and function continuity.',
    descriptionAr: 'دراسة سلوك الدوال عند الاقتراب من نقطة معينة والاتصال.',
  },
  derivatives: {
    id: 'derivatives',
    nameEn: 'Derivatives & Rates of Change',
    nameAr: 'التفاضل والمشتقات ومعدل التغير',
    domain: 'mathematics',
    difficultyTier: 4,
    prerequisites: ['limits_continuity'],
    descriptionEn: 'Differentiation rules, chain rule, and instantaneous rate of change.',
    descriptionAr: 'قواعد الاشتقاق وسرعة التغير اللحظي وتطبيقاتها.',
  },
  integrals: {
    id: 'integrals',
    nameEn: 'Integrals & Area Under Curves',
    nameAr: 'التكامل والمساحة تحت المنحنيات',
    domain: 'mathematics',
    difficultyTier: 5,
    prerequisites: ['derivatives'],
    descriptionEn: 'Definite/indefinite integrals and the fundamental theorem of calculus.',
    descriptionAr: 'التكامل المحدد وغير المحدد والنظرية الأساسية للتفاضل والتكامل.',
  },
};

export function getConcept(id: string): ConceptNode | undefined {
  return CONCEPT_REGISTRY[id];
}

export function getAllConcepts(): ConceptNode[] {
  return Object.values(CONCEPT_REGISTRY);
}

export function getPrerequisites(id: string): ConceptNode[] {
  const concept = getConcept(id);
  if (!concept) return [];
  return concept.prerequisites.map((pId) => CONCEPT_REGISTRY[pId]).filter(Boolean);
}

/**
 * Recursively inspects the prerequisite chain to find the earliest unmastered concept.
 * A concept is considered "unmastered" if the student has attempted it and has < 60% accuracy
 * or < 0.5 confidence, OR has never completed its foundational exercises.
 */
export function diagnosePrerequisiteGap(
  targetConceptId: string,
  masteryLookup: Record<string, { accuracy: number; attempts: number; confidence: number }>
): PrerequisiteDiagnosis {
  const target = getConcept(targetConceptId);
  if (!target) {
    return {
      hasPrerequisiteGap: false,
      targetConceptId,
      explanationEn: 'Concept not found in registry.',
      explanationAr: 'المفهوم غير مسجل في شبكة المعرفة.',
    };
  }

  const visited = new Set<string>();

  function findWeakPrerequisite(currentId: string): ConceptNode | null {
    if (visited.has(currentId)) return null;
    visited.add(currentId);

    const node = getConcept(currentId);
    if (!node) return null;

    for (const prereqId of node.prerequisites) {
      const prereqNode = getConcept(prereqId);
      if (!prereqNode) continue;

      const stats = masteryLookup[prereqId];
      // If prerequisite has been attempted and failed (<60% accuracy or low confidence), it is a blocker
      if (stats && (stats.accuracy < 0.6 || stats.confidence < 0.5)) {
        // Deep dive first to see if an even earlier prerequisite caused this
        const deeper = findWeakPrerequisite(prereqId);
        return deeper || prereqNode;
      }

      // Check upstream recursively
      const upstream = findWeakPrerequisite(prereqId);
      if (upstream) return upstream;
    }

    return null;
  }

  const rootGap = findWeakPrerequisite(targetConceptId);

  if (rootGap) {
    return {
      hasPrerequisiteGap: true,
      targetConceptId,
      rootGapConcept: rootGap,
      explanationEn: `Your difficulty in "${target.nameEn}" appears to stem from an unsolid foundation in "${rootGap.nameEn}". We recommend reviewing it first.`,
      explanationAr: `صعوبتك في فهم "${target.nameAr}" سببها الأساسي عدم التمكن التام من المتطلب السابق "${rootGap.nameAr}". ننصح بمراجعته أولاً.`,
    };
  }

  return {
    hasPrerequisiteGap: false,
    targetConceptId,
    explanationEn: `Prerequisites for "${target.nameEn}" are satisfied. Difficulty is localized to the concept itself.`,
    explanationAr: `المتطلبات السابقة لـ "${target.nameAr}" مكتملة بشكل جيد. الصعوبة مرتبطة مباشرة بالمفهوم الحالي.`,
  };
}