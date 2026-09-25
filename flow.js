/* =====================================================================
   flow.js — Flowchart การระบุเชื้อ/เซลล์ และแนวทางปฏิบัติ (MedTech Quick Reference)
   โครงสร้าง node: { t:ข้อความ, n:หมายเหตุ, a:atlas-id, x:test-id, c:critical, k:[[ป้ายเส้น, node], ...] }
   เพิ่ม/แก้ flowchart ได้ที่ FLOWS ด้านล่าง
   ===================================================================== */
(function(){
'use strict';
const N = (t, o, ...k) => Object.assign({ t, k }, o||{});
const R = (t, o) => Object.assign({ t, r:true }, o||{});   // result node

const FLOWS = [

{ id:'leuk', icon:'🧬', title:'แนวทางระบุ Lineage ของ Acute Leukemia', sub:'Morphology → Cytochemistry → Flow cytometry/IHC → Genetics (WHO 2022)', x:'leuk_workup',
  root: N('พบ blast ใน PB/BM (สงสัย acute leukemia) — แจ้งแพทย์', {c:true, a:'blast'},
    ['', N('นับ blast (BM 500 cells) — AML ≥ 20% (WHO 2022) หรือมี defining genetic abnormality', {x:'leuk_workup'},
      ['', N('Cytochemistry: MPO / SBB ใน blast', {x:'cytochem', a:'l_mpo'},
        ['≥ 3% บวก', N('Myeloid (AML) → ดูรูปแบบ maturation + flow', {x:'flow_aml'},
          ['Hypergranular, bilobed, faggot cell; HLA-DR− CD34−', R('APL (AML-M3) ⚠', {c:true, n:'DIC — ส่ง PML::RARA ด่วน, เริ่ม ATRA', a:'l_apl', x:'cytogen_aml'})],
          ['NSE ≥ 20% (ยับยั้งด้วย NaF), CD14/CD64/CD11b+', R('AML-M4 (myelomonocytic) / M5 (monocytic ≥ 80%)', {a:'l_mono'})],
          ['มี maturation ≥ 10%, Auer rod', R('AML-M2 (มัก t(8;21) RUNX1::RUNX1T1)', {a:'blast'})],
          ['blast ≥ 90% ไม่มี maturation', R('AML-M1')])],
        ['< 3% / ลบ', N('Flow cytometry: lineage-specific markers', {x:'flow_principle'},
          ['CD19 + cCD79a / cCD22 / CD10, TdT+', N('B-ALL → ระยะการเจริญ', {x:'flow_all', a:'l_lymphoblast'},
            ['CD10−', R('Pro-B ALL', {n:'นึกถึง KMT2A::AFF1 t(4;11) ในทารก'})],
            ['CD10+, cIgM−', R('Common B-ALL')],
            ['cIgM+', R('Pre-B ALL', {n:'TCF3::PBX1 t(1;19) พบบ่อย'})],
            ['sIg+ (κ/λ), TdT−', R('Burkitt leukemia (mature B)', {a:'l_burkitt', n:'MYC t(8;14)'})])],
          ['cCD3+, CD7+, TdT+', R('T-ALL', {n:'ถ้า CD1a−, CD8−, CD5 dim + stem/myeloid marker = ETP-ALL', x:'flow_all'})],
          ['CD13/CD33/CD117+, lymphoid markers −', R('AML-M0 (minimally differentiated)', {x:'flow_aml'})],
          ['CD41/CD61+', R('AML-M7 (megakaryoblastic)', {a:'l_megakb', n:'มัก dry tap — ใช้ biopsy/IHC'})],
          ['CD71/CD235a+, erythroid ≥ 80%', R('Acute erythroid leukemia (M6)')],
          ['เข้าเกณฑ์ ≥ 2 lineage', R('MPAL (Mixed phenotype acute leukemia)', {x:'mpal_ihc'})])])])]),
  note:'ต้องส่ง cytogenetics (heparin) และ molecular ทุกราย เพื่อจัดกลุ่ม WHO/ICC และประเมินความเสี่ยง ELN 2022'
},

{ id:'lpd', icon:'🧫', title:'แยกชนิด Mature B-cell Neoplasm จาก Flow cytometry', sub:'Lymphocytosis → clonality (κ/λ) → CD5 / CD10 / CD23 / CD103', x:'flow_lpn',
  root: N('B cell มี light chain restriction (κ หรือ λ อย่างเดียว) หรือ sIg−', {},
    ['CD5+', N('CD23 / CD200 / FMC7', {},
      ['CD23+, CD200+, FMC7−, sIg dim', R('CLL / SLL', {n:'Matutes ≥ 4/5', a:'l_cll'})],
      ['CD23−, CD200−, FMC7+, CD20 bright', R('Mantle cell lymphoma', {n:'Cyclin D1 / SOX11, t(11;14)'})])],
    ['CD5−', N('CD10', {},
      ['CD10+', N('Ki-67 / BCL2', {},
        ['BCL2+, t(14;18)', R('Follicular lymphoma')],
        ['BCL2−, Ki-67 ~100%, MYC', R('Burkitt lymphoma', {a:'l_burkitt'})])],
      ['CD10−', N('CD11c / CD25 / CD103 / CD123', {},
        ['ทั้งหมด +, BRAF V600E', R('Hairy cell leukemia', {a:'l_hairy'})],
        ['ไม่เข้าเกณฑ์', R('Marginal zone lymphoma / LPL (IgM, MYD88 L265P → Waldenström)')])])],
    ['CD38 bright, CD138+, CD19−, CD45 dim', R('Plasma cell neoplasm (Myeloma)', {n:'cytoplasmic κ/λ monotypic, CD56+; ร่วม SPEP/IFE, FLC', a:'l_myeloma'})])
},

{ id:'mpn', icon:'🩸', title:'แนวทางตรวจภาวะเม็ดเลือดสูงต่อเนื่อง (MPN)', sub:'Granulocytosis / Erythrocytosis / Thrombocytosis ที่ไม่มีสาเหตุ', x:'mpn_lab',
  root: N('ตัดสาเหตุ reactive (ติดเชื้อ, ขาดเหล็ก, ขาดออกซิเจน, การอักเสบ) → ตรวจ BCR::ABL1', {},
    ['บวก', R('CML (Ph+, t(9;22))', {n:'LAP ต่ำ, basophilia; ติดตาม %IS', a:'l_cml', x:'lap_score'})],
    ['ลบ', N('JAK2 V617F → (ลบ) CALR exon 9 → (ลบ) MPL exon 10 · ร่วมกับ CBC/BM', {},
      ['Hb/Hct สูง, EPO ต่ำ, JAK2 V617F/exon 12', R('Polycythemia vera', {n:'LAP สูง, B12 สูง'})],
      ['PLT ≥ 450 ต่อเนื่อง, megakaryocyte ใหญ่ staghorn', R('Essential thrombocythemia')],
      ['Leukoerythroblastic + teardrop, fibrosis, ม้ามโต', R('Primary myelofibrosis', {a:'tear'})],
      ['Triple-negative', R('พิจารณา reactive, NGS (ASXL1, TET2…), BM biopsy')])])
},
{ id:'wbc', icon:'🩸', title:'ระบุชนิดเม็ดเลือดขาวบน Blood smear', sub:'ใช้ขณะนับแยกชนิด (WBC differential) — ดูแกรนูล → นิวเคลียส → ไซโทพลาซึม', x:'diff',
  root: N('มีแกรนูลเด่นชัดในไซโทพลาซึม?', {},
    ['มี', N('สีของแกรนูล', {},
      ['ส้ม-แดง ใหญ่ กลมสม่ำเสมอ', R('Eosinophil', {n:'นิวเคลียสมักมี 2 พู', a:'eos'})],
      ['ม่วงดำ หยาบ บังนิวเคลียส', R('Basophil', {a:'baso'})],
      ['ชมพู-ม่วงอ่อน ละเอียด', N('รูปนิวเคลียส', {},
        ['หลายพู มี filament เชื่อม', N('จำนวนพู', {},
          ['2–5 พู', R('Segmented neutrophil', {a:'neut'})],
          ['≥ 6 พู', R('Hypersegmented neutrophil', {n:'สงสัย megaloblastic anemia', a:'hyperseg'})])],
        ['รูป U/C/S กว้างสม่ำเสมอ', R('Band neutrophil', {a:'band'})],
        ['แกรนูลหยาบม่วงเข้ม + vacuole', R('Toxic changes', {n:'รายงานร่วม — ติดเชื้อรุนแรง', a:'toxic'})])])],
    ['ไม่มี / มีน้อย', N('ลักษณะนิวเคลียสและ N:C ratio', {},
      ['กลมทึบ N:C สูง ขอบฟ้าบาง ขนาด ≈ RBC', R('Lymphocyte', {a:'lymph'})],
      ['เซลล์ใหญ่ ไซโทพลาซึมฟ้าโอบ RBC', R('Reactive lymphocyte', {n:'Dengue / EBV', a:'reactlymph'})],
      ['รูปไต/พับ ลายลูกไม้ ไซโทพลาซึมเทาฟ้า มี vacuole', R('Monocyte', {a:'mono'})],
      ['กลมชิดขอบ clock-face + hof', R('Plasma cell', {a:'plasma'})],
      ['โครมาทินละเอียด มี nucleoli, N:C สูงมาก', R('Blast ⚠', {c:true, n:'แจ้งแพทย์ — ถ้ามี Auer rod = สายไมอีลอยด์', a:'blast'})],
      ['นิวเคลียสทึบดำเล็ก ไซโทพลาซึมชมพูเทา', R('nRBC', {n:'ต้องคำนวณ Corrected WBC', a:'nrbc', x:'corrwbc'})],
      ['เหลือแต่นิวเคลียสบี้แตก', R('Smudge cell', {n:'พบมากใน CLL', a:'smudge'})])])
},

{ id:'anemia', icon:'🧪', title:'แนวทางแยกสาเหตุภาวะโลหิตจางตาม MCV', sub:'CBC + reticulocyte + blood smear (ปรับใช้กับบริบทไทย: thalassemia/HbE, G6PD)', x:'cbc',
  root: N('Hb ต่ำ → ดู MCV', {},
    ['< 80 fL (Microcytic)', N('Serum ferritin', {x:'iron_anemia_panel'},
      ['ต่ำ', R('Iron deficiency anemia', {n:'หาสาเหตุเสียเลือด / พยาธิปากขอ', a:'microhypo'})],
      ['ปกติ/สูง', N('Hb typing (HPLC / electrophoresis) ± Mentzer index (MCV/RBC < 13)', {x:'hb_typing'},
        ['HbA₂ ≥ 3.5%', R('β-thalassemia trait', {a:'target'})],
        ['มี HbE', R('HbE trait / HbE homozygous / β-thal/HbE')],
        ['พบ HbH / HbH inclusion', R('HbH disease (α-thalassemia)', {a:'hbh'})],
        ['รูปแบบปกติ', R('α-thal trait (ยืนยัน PCR) / ACD / Sideroblastic', {a:'pappen'})])])],
    ['80–100 fL (Normocytic)', N('Reticulocyte / RPI', {x:'retic'},
      ['สูง (RPI > 2–3)', N('หลักฐานการแตกของเม็ดเลือด: LDH↑ indirect bilirubin↑ haptoglobin↓ → DAT', {x:'coombs'},
        ['DAT +', R('AIHA / Transfusion reaction / HDFN', {a:'sphero'})],
        ['DAT −', N('ดู blood smear', {},
          ['Bite / blister cell, Heinz body', R('G6PD deficiency', {a:'bite', x:'g6pd'})],
          ['Spherocyte', R('Hereditary spherocytosis', {a:'sphero', x:'osmotic_fragility'})],
          ['Schistocyte ≥ 1%', R('MAHA: DIC / TTP / HUS ⚠', {c:true, a:'schisto'})],
          ['Ring form / gametocyte', R('Malaria ⚠', {c:true, a:'pf_ring', x:'malaria_smear'})])])],
      ['ต่ำ (RPI < 2)', R('ACD, CKD (EPO ต่ำ), ไขกระดูกล้มเหลว/ถูกแทนที่', {n:'ถ้ามี pancytopenia หรือ blast → Bone marrow', a:'tear'})])],
    ['> 100 fL (Macrocytic)', N('Blood smear', {},
      ['Oval macrocyte + hypersegmented PMN', R('Megaloblastic: ขาด B12 / Folate', {a:'hyperseg'})],
      ['Round macrocyte / target / polychromasia', R('Non-megaloblastic: ตับ, แอลกอฮอล์, hypothyroid, reticulocytosis, MDS', {a:'polychrom'})])])
},

{ id:'malaria', icon:'🦟', title:'แยกชนิดเชื้อมาลาเรียจาก Thin film', sub:'Giemsa pH 7.2 — ดูขนาด RBC ที่ติดเชื้อก่อน แล้วจึงดูรูปร่างปรสิต', x:'malaria_smear',
  root: N('RBC ที่ติดเชื้อ “ขนาด” เทียบกับ RBC ปกติ', {},
    ['ปกติ หรือ เล็กลง', N('ลักษณะปรสิต', {},
      ['ring เล็ก บาง หลาย ring/เซลล์, double chromatin, appliqué; gametocyte รูปกล้วย', R('P. falciparum ⚠', {c:true, n:'นับ % parasitemia; > 2–5% / มี schizont = severe', a:'pf_ring'})],
      ['band form, schizont 6–12 merozoite แบบดอกกุหลาบ, pigment หยาบ', R('P. malariae', {n:'ถ้ามี ring แบบ falciparum ร่วมด้วย + สัมผัสป่า/ลิงแสม → สงสัย P. knowlesi (PCR)', a:'pm_band'})])],
    ['โต 1.5–2 เท่า', N('ลักษณะ RBC และปรสิต', {},
      ['RBC กลม, trophozoite แบบอะมีบา, Schüffner’s dots, merozoite 12–24', R('P. vivax', {n:'ตรวจ G6PD ก่อนให้ primaquine', a:'pv_troph'})],
      ['RBC รูปไข่ ขอบหยัก (fimbriated), James’ dots, merozoite 6–14', R('P. ovale')])]),
  note:'ตรวจ thick film เพื่อหาเชื้อ (ไวกว่า) และ thin film เพื่อแยกชนิด; ต้องตรวจอย่างน้อย 200–300 oil fields ก่อนรายงานผลลบ และอาจพบ mixed infection'
},

{ id:'gpc', icon:'🟣', title:'Gram-positive cocci identification', sub:'จากโคโลนีบน Blood agar — Catalase → Coagulase / Hemolysis', x:'bacid_staph',
  root: N('Gram + cocci → Catalase (3% H₂O₂)', {n:'ห้ามแตะ blood agar (RBC ให้ผลบวกปลอม)'},
    ['+ (มีฟอง)', N('Staphylococcus / Micrococcus → Coagulase (tube)', {a:'b_staph'},
      ['+', R('Staphylococcus aureus', {n:'จาก hemoculture = critical; ทดสอบ cefoxitin หา MRSA'})],
      ['−', N('Coagulase-negative staphylococci → Novobiocin 5 µg', {},
        ['S (zone ≥ 16 mm)', R('S. epidermidis (และ CoNS อื่น)', {n:'มักปนเปื้อน — พิจารณาจำนวนขวดที่ขึ้น'})],
        ['R', R('S. saprophyticus', {n:'UTI ในหญิงวัยเจริญพันธุ์'})])])],
    ['− (ไม่มีฟอง)', N('Streptococcus / Enterococcus → ดู hemolysis บน sheep BA', {a:'b_strep', x:'bacid_strep'},
      ['β (ใส)', N('Bacitracin 0.04 U / PYR', {},
        ['S / PYR +', R('S. pyogenes (Group A)')],
        ['R → CAMP + / Hippurate +', R('S. agalactiae (Group B)', {n:'หญิงตั้งครรภ์/ทารกแรกเกิด'})],
        ['R, CAMP −', R('β-strep Group C / G (ยืนยันด้วย Lancefield grouping)')])],
      ['α (เขียว)', N('Optochin (P disk) / Bile solubility', {},
        ['S ≥ 14 mm / bile soluble', R('S. pneumoniae', {a:'b_pneumo'})],
        ['R / bile insoluble', R('Viridans streptococci')])],
      ['γ (ไม่มี)', N('Bile esculin + → 6.5% NaCl broth', {},
        ['เจริญ (PYR +)', R('Enterococcus spp.', {n:'ตรวจ VRE เมื่อเหมาะสม'})],
        ['ไม่เจริญ (PYR −)', R('S. gallolyticus (S. bovis group)', {n:'สัมพันธ์มะเร็งลำไส้ใหญ่/endocarditis'})])])])
},

{ id:'gnr', icon:'🔴', title:'Gram-negative rods identification', sub:'MacConkey + Oxidase + TSI — ปรับสำหรับห้องปฏิบัติการในไทย', x:'bacid_entero_lactose',
  root: N('Gram − rods → Oxidase', {},
    ['− (Oxidase negative)', N('TSI: หมักกลูโคสหรือไม่?', {},
      ['หมัก (butt เหลือง) → Enterobacterales', N('Lactose บน MacConkey', {a:'b_gnr'},
        ['LF (สีชมพู)', N('Indole', {},
          ['+', R('Escherichia coli', {n:'TSI A/A gas +, motile'})],
          ['−', R('Klebsiella (mucoid, non-motile, VP +) / Enterobacter (motile)')])],
        ['NLF (ไม่มีสี)', N('H₂S (TSI ดำ)', {x:'bacid_entero_h2s'},
          ['+', N('Urease', {},
            ['+ (เร็ว)', R('Proteus', {n:'swarming, PAD +; P. vulgaris indole +'})],
            ['−', R('Salmonella', {n:'LDC + — ระวัง Citrobacter freundii (LDC −); ส่ง serogroup'})])],
          ['−', N('Motility', {x:'bacid_entero_noh2s'},
            ['ไม่เคลื่อนที่', R('Shigella', {n:'K/A no gas, LDC − → serology'})],
            ['เคลื่อนที่', R('อื่น ๆ: Morganella, Providencia, S. Typhi (H₂S น้อย) → ชุดทดสอบ/MALDI-TOF')])])])],
      ['ไม่หมัก (K/K) → Non-fermenter', N('ลักษณะเพิ่มเติม', {x:'bacid_nonferm'},
        ['coccobacilli, non-motile', R('Acinetobacter baumannii', {n:'เชื้อดื้อยาในโรงพยาบาล (CRAB)'})],
        ['DNase +, โคโลนีม่วงลาเวนเดอร์', R('Stenotrophomonas maltophilia')])])],
    ['+ (Oxidase positive)', N('TSI / OF glucose', {},
      ['หมัก → Vibrio / Aeromonas', N('TCBS agar', {x:'bacid_vibrio'},
        ['เหลือง (sucrose +)', R('V. cholerae ⚠', {c:true, n:'agglutinate O1/O139 — โรคติดต่ออันตราย ต้องรายงาน', a:'b_vibrio'})],
        ['เขียว', R('V. parahaemolyticus (halophilic)', {n:'อาหารทะเล'})],
        ['ไม่เจริญ, β-hemolysis', R('Aeromonas')])],
      ['ไม่หมัก', N('โคโลนี / การทดสอบ', {},
        ['เม็ดสีเขียว (pyocyanin), กลิ่นองุ่น, เจริญ 42 °C', R('Pseudomonas aeruginosa')],
        ['โคโลนีแห้งย่นบน Ashdown, ดื้อ Gentamicin & Colistin, ไว Amox-clav', R('Burkholderia pseudomallei ⚠', {c:true, n:'Melioidosis — BSL-3, แจ้งแพทย์ทันที', a:'b_bps'})])])])
},

{ id:'ova', icon:'🥚', title:'Key การระบุไข่หนอนพยาธิในอุจจาระ', sub:'ดู operculum → spine → plug → hooklet → ผิวเปลือก → ขนาด', x:'ova',
  root: N('ไข่มีฝาปิด (operculum)?', {},
    ['มี', N('ขนาดและลักษณะ', {},
      ['เล็ก < 35 µm มีไหล่ + knob', R('Opisthorchis viverrini / Clonorchis', {n:'อีสาน — เสี่ยงมะเร็งท่อน้ำดี', a:'ov'})],
      ['80–120 µm มีไหล่ ปลายอีกข้างเปลือกหนา', R('Paragonimus', {n:'ตรวจเสมหะด้วย', a:'parag'})],
      ['> 130 µm เปลือกบาง ฝาเล็กไม่ชัด', R('Fasciola / Fasciolopsis buski', {a:'fasc'})])],
    ['ไม่มี', N('ลักษณะเด่นที่เห็น', {},
      ['มีหนาม (spine)', N('ตำแหน่งหนาม', {},
        ['ด้านข้าง ใหญ่', R('Schistosoma mansoni', {a:'sch_m'})],
        ['ปลายสุด (ในปัสสาวะ)', R('Schistosoma haematobium', {a:'sch_h'})],
        ['ปุ่มเล็กด้านข้าง ไข่กลม', R('S. japonicum / S. mekongi')])],
      ['จุก 2 ขั้ว (bipolar plugs)', N('รูปร่างจุก', {},
        ['ยื่นออก เปลือกเรียบ รูปถัง', R('Trichuris trichiura', {a:'trich'})],
        ['แบน เปลือกมีลายขีด รูปถั่วลิสง', R('Capillaria philippinensis', {a:'capil'})])],
      ['ตะขอ 6 อัน (hexacanth)', N('เปลือก', {},
        ['หนา ลายรัศมี สีน้ำตาล', R('Taenia spp.', {a:'taenia'})],
        ['บาง มี polar filaments', R('Hymenolepis nana', {a:'hnana'})],
        ['บาง ไม่มี filament ใหญ่ 70–85 µm', R('Hymenolepis diminuta')])],
      ['ผิวปุ่มขรุขระ (mammillated)', R('Ascaris lumbricoides', {n:'fertile รีกลม / unfertile ยาว', a:'asc_f'})],
      ['ด้านหนึ่งแบน (รูป D) มีตัวอ่อน', R('Enterobius vermicularis', {n:'ตรวจด้วยเทปใส', a:'entero', x:'scotch_tape'})],
      ['เปลือกบางใส มี morula 4–8 เซลล์', R('Hookworm', {a:'hook'})],
      ['ไม่ใช่ไข่แต่เป็นตัวอ่อน', R('Strongyloides rhabditiform larva', {n:'buccal canal สั้น + genital primordium ชัด', a:'strongy'})])])
},

{ id:'fungi', icon:'🍄', title:'แนวทางระบุเชื้อราจาก KOH / Direct smear', sub:'ลักษณะใน direct exam → การเพาะเชื้อยืนยัน', x:'koh',
  root: N('สิ่งที่พบใน KOH / smear', {},
    ['ยีสต์แตกหน่อ ± pseudohyphae', N('Germ tube test', {a:'f_cand'},
      ['+', R('Candida albicans', {a:'f_germ'})],
      ['−', R('Candida อื่น / ยีสต์อื่น → CHROMagar / ชุดทดสอบ')])],
    ['ยีสต์กลมมีแคปซูลหนา (India ink)', R('Cryptococcus neoformans ⚠', {c:true, n:'ยืนยัน CrAg; urease +', a:'f_crypto'})],
    ['hyphae สั้น + ยีสต์กลมเป็นกลุ่ม', R('Malassezia', {a:'f_mala'})],
    ['hyphae ใส มี septum', N('ตำแหน่ง/ลักษณะ', {},
      ['ผิวหนัง ผม เล็บ + arthroconidia', N('Dermatophyte → เพาะ SDA + cycloheximide 25–28 °C', {a:'f_derm'},
        ['macroconidia กระสวย ผนังหนาขรุขระ', R('Microsporum', {a:'f_mcanis'})],
        ['microconidia หยดน้ำตามเส้นใย', R('Trichophyton', {a:'f_trub'})],
        ['macroconidia รูปกระบองเป็นกลุ่ม ไม่มี micro', R('Epidermophyton', {a:'f_epid'})])],
      ['ที่ปลอดเชื้อ/เสมหะ แตกแขนงมุม 45°', R('Aspergillus / Fusarium → เพาะเชื้อ + LPCB', {a:'f_asp'})])],
    ['hyphae กว้าง แบน แทบไม่มี septum มุม 90°', R('Mucorales ⚠', {c:true, n:'รายงานด่วน — ห้ามบดเนื้อเยื่อ', a:'f_muc'})],
    ['เซลล์สีน้ำตาลผนังหนามี septum (copper pennies)', R('Chromoblastomycosis', {a:'f_chromo'})],
    ['ยีสต์ในเซลล์ macrophage', N('การแบ่งตัว', {},
      ['มี septum ตรงกลาง (fission)', R('Talaromyces marneffei ⚠', {c:true, n:'HIV — เพาะ 25 °C สร้างสีแดงแพร่', a:'f_tmarn'})],
      ['แตกหน่อ เล็ก 2–4 µm', R('Histoplasma capsulatum', {a:'f_histo'})])])
},

{ id:'hematuria', icon:'💧', title:'แนวทางแปลผล Hematuria / สีแดงในปัสสาวะ', sub:'Dipstick blood + ร่วมกับกล้องจุลทรรศน์', x:'ua',
  root: N('Dipstick blood บวก → ตรวจตะกอนพบ RBC?', {},
    ['ไม่พบ RBC', N('ดูพลาสมา/ซีรั่มของผู้ป่วย', {},
      ['พลาสมาสีชมพู/แดง, haptoglobin ต่ำ', R('Hemoglobinuria (intravascular hemolysis)', {n:'เช่น G6PD, transfusion reaction'})],
      ['พลาสมาใส, CK สูงมาก', R('Myoglobinuria (Rhabdomyolysis)', {x:'ck_total'})])],
    ['พบ RBC', N('ลักษณะ RBC และสิ่งที่พบร่วม', {a:'u_rbc'},
      ['Dysmorphic / G1 cell ≥ 5%, RBC cast, proteinuria', R('Glomerular hematuria ⚠', {c:true, n:'Glomerulonephritis — รายงาน RBC cast', a:'c_rbc'})],
      ['RBC รูปร่างปกติ (isomorphic), มีลิ่มเลือด', R('Non-glomerular: นิ่ว, ติดเชื้อ, เนื้องอก, บาดเจ็บ', {n:'พิจารณา urine cytology ในผู้สูงอายุ'})],
      ['มีเลือดประจำเดือน / สวนปัสสาวะ', R('Contamination — เก็บตัวอย่างใหม่')])]),
  note:'ถ้า dipstick ลบ แต่ปัสสาวะสีแดง → สาเหตุอื่น เช่น บีทรูท, ยา rifampicin, porphyria'
},

{ id:'mixing', icon:'⏱', title:'แปลผล PT / APTT และ Mixing study', sub:'แยก factor deficiency กับ inhibitor', x:'mixing_study',
  root: N('ผล PT และ APTT', {},
    ['PT ปกติ · APTT ยาว', N('Mixing 1:1 กับ normal pooled plasma (ทันที และบ่ม 37 °C 1–2 ชม.)', {},
      ['แก้ไขได้ (corrects)', R('ขาด Factor VIII, IX, XI, XII (หรือ prekallikrein/HMWK)', {n:'VIII/IX → Hemophilia A/B; XII ไม่มีเลือดออก'})],
      ['แก้ไขไม่ได้ทันที', R('Lupus anticoagulant / Heparin', {n:'ยืนยัน LA ด้วย dRVVT; ตรวจ anti-Xa/TT ถ้าสงสัย heparin'})],
      ['แก้ได้ทันที แต่ยาวขึ้นหลังบ่ม', R('Specific factor inhibitor (เช่น acquired anti-FVIII)', {c:true})])],
    ['PT ยาว · APTT ปกติ', R('ขาด Factor VII / ระยะแรกของ warfarin หรือขาดวิตามิน K / โรคตับระยะแรก')],
    ['PT ยาว · APTT ยาว', R('Common pathway (X, V, II, fibrinogen), DIC, โรคตับ, ขาดวิตามิน K, warfarin', {n:'ตรวจ fibrinogen, D-dimer, platelet', x:'ddimer'})],
    ['ทั้งคู่ปกติ แต่มีเลือดออก', R('Platelet function disorder, vWD, Factor XIII deficiency, หลอดเลือดผิดปกติ', {x:'plt_aggregation'})]),
  note:'ตรวจสอบก่อนเสมอ: สัดส่วนเลือด:citrate 9:1, Hct > 55% ต้องปรับปริมาณ citrate, ไม่มีลิ่มเลือด/hemolysis, ไม่ได้เจาะจากสาย heparin'
},

{ id:'txr', icon:'🩹', title:'แนวทางสอบสวนปฏิกิริยาจากการให้เลือด', sub:'Suspected transfusion reaction workup (Blood bank)', x:'reaction',
  root: N('สงสัยปฏิกิริยา: หยุดให้เลือดทันที คงสาย IV ด้วย NSS แจ้งแพทย์และธนาคารเลือด', {c:true},
    ['', N('Clerical check: ชื่อ-HN ผู้ป่วย / ป้ายถุง / ใบขอเลือด ตรงกันหรือไม่?', {},
      ['ไม่ตรง', R('สงสัย ABO-incompatible AHTR ⚠', {c:true, n:'เร่งด่วน: ตรวจสอบผู้ป่วยอีกรายที่อาจได้รับถุงสลับกัน'})],
      ['ตรง', N('เก็บเลือดหลังให้ (EDTA + clotted) และปัสสาวะ: ดู hemolysis ในพลาสมา + DAT', {x:'coombs'},
        ['Hemolysis + และ/หรือ DAT +', R('Hemolytic reaction (AHTR/DHTR)', {n:'ตรวจซ้ำ ABO/Rh ก่อน-หลัง, antibody screen, crossmatch, bilirubin, LDH, haptoglobin, urine Hb', x:'antibodyid'})],
        ['ไม่พบ hemolysis, DAT −', N('อาการเด่น', {},
          ['ไข้ ≥ 1 °C อย่างเดียว', R('FNHTR', {n:'แยก sepsis: เพาะเชื้อถุงเลือดและผู้ป่วยถ้าไข้สูง/ความดันต่ำ'})],
          ['ผื่นลมพิษ คัน', R('Allergic reaction', {n:'อาการเล็กน้อยอาจให้ต่อได้หลังให้ยาแก้แพ้ตามคำสั่งแพทย์'})],
          ['หายใจลำบาก/ออกซิเจนต่ำ ภายใน 6 ชม.', R('TRALI vs TACO', {n:'TACO: BNP สูง น้ำเกิน ความดันสูง; TRALI: ไม่ใช่จากหัวใจ'})],
          ['ความดันต่ำ/anaphylaxis', R('Anaphylactic reaction', {c:true, n:'เช่น IgA deficiency ที่มี anti-IgA'})])])])])
},

{ id:'bc', icon:'🧫', title:'Workflow: Positive blood culture', sub:'จากสัญญาณเตือนของเครื่องถึงการรายงานผลสุดท้าย', x:'bc',
  root: N('เครื่องแจ้ง Positive', {},
    ['', N('Gram stain จากขวดทันที (ภายใน 1 ชม.)', {},
      ['', N('โทรแจ้งผล Gram stain ให้แพทย์/หอผู้ป่วย = Critical value', {c:true, n:'บันทึกชื่อผู้รับแจ้ง เวลา และทวนผล (read-back)'},
        ['', N('Subculture: BA, CA, MAC (± anaerobic) + rapid ID (MALDI-TOF / direct panel) ถ้ามี', {},
          ['', N('ระบุเชื้อ + ทดสอบความไวต่อยา (AST) ตาม CLSI', {x:'ast'},
            ['', R('รายงานผลเบื้องต้น → ผลสุดท้าย พร้อมแจ้ง MDR (MRSA, ESBL, CRE, VRE)', {x:'resistreport'})])])])])]),
  note:'ไม่พบเชื้อภายใน 5 วัน → รายงานผลลบ; เชื้อผิวหนัง (CoNS, Corynebacterium, Bacillus) ขึ้นขวดเดียว มักเป็นการปนเปื้อน'
},
];

/* ---------------- render ---------------- */
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function nodeHTML(n){
  const cls = (n.r?'r':'q') + (n.c?' c':'');
  const btns = (n.a?`<button class="fc-btn" data-fc-atlas="${n.a}" title="ดูภาพในแอตลาส">🔬 ดูภาพ</button>`:'') + (n.x?`<button class="fc-btn" data-fc-test="${n.x}" title="เปิดรายการตรวจ">📄 รายการตรวจ</button>`:'');
  let h = `<div class="fc-node ${cls}"><div class="fc-t">${esc(n.t)}</div>${n.n?`<div class="fc-n">${esc(n.n)}</div>`:''}${btns?`<div class="fc-btns">${btns}</div>`:''}</div>`;
  if(n.k && n.k.length){
    h += `<div class="fc-kids">${n.k.map(([lab, child])=>`<div class="fc-kid">${lab?`<span class="fc-e">${esc(lab)}</span>`:''}${nodeHTML(child)}</div>`).join('')}</div>`;
  }
  return h;
}
let cur = null;
try{ cur = localStorage.getItem('mtq_flow_cur'); }catch(e){}
function render(el){
  if(!FLOWS.some(f=>f.id===cur)) cur = FLOWS[0].id;
  const f = FLOWS.find(x=>x.id===cur);
  el.innerHTML = `<div class="section-head"><h2>🧭 Flowchart การระบุเชื้อ/เซลล์</h2><p>แผนผังตัดสินใจแบบย่อ — แตะ 🔬 เพื่อดูภาพใต้กล้อง หรือ 📄 เพื่อเปิดรายละเอียดการตรวจ</p></div>
    <div class="at-chips">${FLOWS.map(x=>`<button class="at-chip ${x.id===cur?'on':''}" data-fc-sel="${x.id}">${x.icon} ${esc(x.title)}</button>`).join('')}</div>
    <div class="fc-card"><h3>${f.icon} ${esc(f.title)}</h3><p class="fc-sub">${esc(f.sub)}${f.x?` · <button class="fc-btn" data-fc-test="${f.x}">📄 รายการตรวจที่เกี่ยวข้อง</button>`:''}</p>
      <div class="fc">${nodeHTML(f.root)}</div>
      ${f.note?`<div class="fc-note">💡 ${esc(f.note)}</div>`:''}
      <div class="fc-legend"><span class="lg q">คำถาม/การทดสอบ</span><span class="lg r">ผลการระบุ</span><span class="lg c">⚠ ต้องแจ้ง/รายงานด่วน</span></div>
    </div>
    <div class="disclaimer">Flowchart เป็นแนวทางแบบย่อเพื่อทบทวน — การระบุเชื้อจริงต้องใช้ชุดทดสอบ/วิธีมาตรฐานของห้องปฏิบัติการ (CLSI, SOP ของหน่วยงาน) และวิจารณญาณของผู้ตรวจ</div>`;
}
function mount(el, hooks){
  render(el);
  if(el._fcBound) return; el._fcBound = true;
  el.addEventListener('click', e=>{
    const t = e.target.closest('[data-fc-sel],[data-fc-atlas],[data-fc-test]'); if(!t) return;
    if(t.dataset.fcSel){ cur = t.dataset.fcSel; try{ localStorage.setItem('mtq_flow_cur', cur); }catch(_){} render(el); el.scrollIntoView({block:'start'}); }
    else if(t.dataset.fcAtlas){ hooks && hooks.openAtlas && hooks.openAtlas(t.dataset.fcAtlas); }
    else if(t.dataset.fcTest){ hooks && hooks.openTest && hooks.openTest(t.dataset.fcTest); }
  });
}
window.FLOW = { flows: FLOWS, mount };
document.dispatchEvent(new Event('flow-ready'));
})();
