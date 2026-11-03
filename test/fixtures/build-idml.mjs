// 테스트용 IDML 생성기: node test/fixtures/build-idml.mjs → test/fixtures/sample.idml
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'sample.idml');
const tmp = join(here, '.idml-src');
rmSync(tmp, { recursive: true, force: true });

const W = 430.866, H = 637.795; // 152 × 225mm
const HY = H / 2;
const files = {
  mimetype: 'application/vnd.adobe.indesign-idml-package',
  'designmap.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="18.0(52)" ?>
<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0" Self="d">
  <TextVariable Self="dTextVariablen러닝헤드" Name="러닝헤드" VariableType="MatchParagraphStyleType">
    <MatchParagraphStylePreference TextBefore="" TextAfter="" SearchStrategy="FirstOnPage" ChangeCase="None" DeleteEndPunctuation="false">
      <Properties><AppliedParagraphStyle type="object">ParagraphStyle/제목%3a장제목</AppliedParagraphStyle></Properties>
    </MatchParagraphStylePreference>
  </TextVariable>
  <idPkg:Graphic src="Resources/Graphic.xml"/>
  <idPkg:Styles src="Resources/Styles.xml"/>
  <idPkg:Preferences src="Resources/Preferences.xml"/>
  <idPkg:MasterSpread src="MasterSpreads/MasterSpread_ua.xml"/>
  <idPkg:Spread src="Spreads/Spread_ub.xml"/>
  <idPkg:Story src="Stories/Story_u100.xml"/>
  <idPkg:Story src="Stories/Story_u101.xml"/>
  <idPkg:Story src="Stories/Story_u102.xml"/>
</Document>`,
  'Resources/Preferences.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Preferences xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <DocumentPreference PageHeight="${H}" PageWidth="${W}" PagesPerDocument="4" FacingPages="true" PageBinding="LeftToRight"/>
  <MarginPreference ColumnCount="1" ColumnGutter="12" Top="56.693" Bottom="62.362" Left="53.858" Right="45.354"/>
  <GridPreference BaselineStart="56.693" BaselineDivision="17" BaselineGridRelativeOption="TopOfPageOfBaselineGridRelativeOption"/>
</idPkg:Preferences>`,
  'Resources/Graphic.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>
  <Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper"/>
  <Color Self="Color/포인트" Model="Process" Space="CMYK" ColorValue="100 40 0 0" Name="포인트"/>
  <Color Self="Color/코드배경" Model="Process" Space="RGB" ColorValue="244 244 240" Name="코드배경"/>
  <Swatch Self="Swatch/None" Name="None"/>
</idPkg:Graphic>`,
  'Resources/Styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <RootParagraphStyleGroup Self="u7a">
    <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" FillColor="Color/Black" PointSize="12" AutoLeading="120" Justification="LeftAlign" Tracking="0" FirstLineIndent="0" SpaceBefore="0" SpaceAfter="0" FontStyle="Regular" HorizontalScale="100" KeepWithNext="0" StartParagraph="Anywhere">
      <Properties><Leading type="enumeration">Auto</Leading><AppliedFont type="string">Minion Pro</AppliedFont></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle">
      <Properties><BasedOn type="string">$ID/[No paragraph style]</BasedOn></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/본문" Name="본문" PointSize="10" Tracking="-25" FirstLineIndent="10" Justification="LeftJustified" FontStyle="Regular">
      <Properties><BasedOn type="object">ParagraphStyle/$ID/NormalParagraphStyle</BasedOn><Leading type="unit">17</Leading><AppliedFont type="string">AppleMyungjo</AppliedFont></Properties>
    </ParagraphStyle>
    <ParagraphStyleGroup Self="ParagraphStyleGroup/제목" Name="제목">
      <ParagraphStyle Self="ParagraphStyle/제목%3a장제목" Name="장제목" PointSize="22" FontStyle="Bold" FirstLineIndent="0" Justification="LeftAlign" SpaceAfter="48" StartParagraph="NextOddPage" KeepWithNext="2" FillColor="Color/포인트" RuleBelow="true" RuleBelowLineWeight="1.5" RuleBelowColor="Color/포인트">
        <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><Leading type="unit">30</Leading><AppliedFont type="string">Apple SD Gothic Neo</AppliedFont></Properties>
      </ParagraphStyle>
      <ParagraphStyle Self="ParagraphStyle/제목%3a절제목" Name="절제목" PointSize="14" FontStyle="Bold" FirstLineIndent="0" Justification="LeftAlign" SpaceBefore="28" SpaceAfter="10" KeepWithNext="2" FillColor="Color/포인트">
        <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><Leading type="unit">20</Leading><AppliedFont type="string">Apple SD Gothic Neo</AppliedFont></Properties>
      </ParagraphStyle>
      <ParagraphStyle Self="ParagraphStyle/제목%3a소제목" Name="소제목" PointSize="11" FontStyle="SemiBold" FirstLineIndent="0" Justification="LeftAlign" SpaceBefore="14" SpaceAfter="4" KeepWithNext="2">
        <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><AppliedFont type="string">Apple SD Gothic Neo</AppliedFont></Properties>
      </ParagraphStyle>
    </ParagraphStyleGroup>
    <ParagraphStyle Self="ParagraphStyle/글머리 목록" Name="글머리 목록" FirstLineIndent="0" LeftIndent="14">
      <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/코드" Name="코드" PointSize="8.5" Tracking="0" FirstLineIndent="0" LeftIndent="6" RightIndent="6" Justification="LeftAlign" ParagraphShadingOn="true" ParagraphShadingColor="Color/코드배경">
      <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><Leading type="unit">13</Leading><AppliedFont type="string">D2Coding</AppliedFont></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/표 본문" Name="표 본문" PointSize="8.5" FirstLineIndent="0" Justification="LeftAlign">
      <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><Leading type="unit">13</Leading><AppliedFont type="string">Apple SD Gothic Neo</AppliedFont></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/각주" Name="각주" PointSize="8" FirstLineIndent="0">
      <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><Leading type="unit">12</Leading></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/쪽번호" Name="쪽번호" PointSize="8" Tracking="0" FirstLineIndent="0" Justification="LeftAlign" FontStyle="Regular">
      <Properties><BasedOn type="object">ParagraphStyle/본문</BasedOn><Leading type="unit">10</Leading><AppliedFont type="string">Apple SD Gothic Neo</AppliedFont></Properties>
    </ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/쪽번호오른" Name="쪽번호오른" Justification="RightAlign">
      <Properties><BasedOn type="object">ParagraphStyle/쪽번호</BasedOn></Properties>
    </ParagraphStyle>
  </RootParagraphStyleGroup>
</idPkg:Styles>`,
  'MasterSpreads/MasterSpread_ua.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <MasterSpread Self="ua" Name="A-본문" NamePrefix="A" BaseName="본문" ItemTransform="1 0 0 1 0 0">
    <Page Self="ua1" Name="A" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 ${-W} ${-HY}">
      <MarginPreference ColumnCount="1" ColumnGutter="12" Top="56.693" Bottom="62.362" Left="53.858" Right="45.354"/>
    </Page>
    <Page Self="ua2" Name="A" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 0 ${-HY}">
      <MarginPreference ColumnCount="1" ColumnGutter="12" Top="56.693" Bottom="62.362" Left="53.858" Right="45.354"/>
    </Page>
    <TextFrame Self="uf1" ParentStory="u100" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
        <PathPointType Anchor="${-W + 45.354} ${HY - 40}"/><PathPointType Anchor="${-W + 45.354} ${HY - 28}"/>
        <PathPointType Anchor="${-W + 245} ${HY - 28}"/><PathPointType Anchor="${-W + 245} ${HY - 40}"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
      <TextFramePreference TextColumnCount="1" VerticalJustification="TopAlign"/>
    </TextFrame>
    <TextFrame Self="uf2" ParentStory="u101" ItemTransform="1 0 0 1 ${W - 245} ${HY - 40}">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
        <PathPointType Anchor="0 0"/><PathPointType Anchor="0 12"/><PathPointType Anchor="${245 - 45.354} 12"/><PathPointType Anchor="${245 - 45.354} 0"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
    </TextFrame>
    <TextFrame Self="uf3" ParentStory="u102" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
        <PathPointType Anchor="53.858 ${-HY + 56.693}"/><PathPointType Anchor="53.858 ${HY - 62.362}"/>
        <PathPointType Anchor="${W - 45.354} ${HY - 62.362}"/><PathPointType Anchor="${W - 45.354} ${-HY + 56.693}"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
      <TextFramePreference TextColumnCount="1" TextColumnGutter="12"/>
    </TextFrame>
    <GraphicLine Self="ul1" StrokeWeight="0.5" StrokeColor="Color/포인트" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="true"><PathPointArray>
        <PathPointType Anchor="${-W + 45.354} ${HY - 44}"/><PathPointType Anchor="${-53.858} ${HY - 44}"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
    </GraphicLine>
    <Rectangle Self="ur1" FillColor="Color/포인트" StrokeWeight="0" ItemTransform="1 0 0 1 0 0">
      <Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
        <PathPointType Anchor="${W - 8} ${-HY + 60}"/><PathPointType Anchor="${W - 8} ${-HY + 120}"/>
        <PathPointType Anchor="${W} ${-HY + 120}"/><PathPointType Anchor="${W} ${-HY + 60}"/>
      </PathPointArray></GeometryPathType></PathGeometry></Properties>
    </Rectangle>
  </MasterSpread>
</idPkg:MasterSpread>`,
  'Spreads/Spread_ub.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Spread Self="ub" ItemTransform="1 0 0 1 0 0">
    <Page Self="ub1" AppliedMaster="ua" Name="1" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 0 ${-HY}"/>
  </Spread>
</idPkg:Spread>`,
  'Stories/Story_u100.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Story Self="u100">
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/쪽번호">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><?ACE 18?><Content>  |  </Content><Content>파이썬으로 배우는 조판</Content></CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`,
  'Stories/Story_u101.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Story Self="u101">
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/쪽번호오른">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><TextVariableInstance Self="tvi1" Name="&lt;러닝헤드&gt;" ResultText="장 제목" AssociatedTextVariable="dTextVariablen러닝헤드"/><Content>  |  </Content><?ACE 18?></CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`,
  'Stories/Story_u102.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
  <Story Self="u102">
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/본문"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"/></ParagraphStyleRange>
  </Story>
</idPkg:Story>`
};

for (const [name, body] of Object.entries(files)) {
  const p = join(tmp, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
rmSync(out, { force: true });
execFileSync('zip', ['-X0', out, 'mimetype'], { cwd: tmp });
execFileSync('zip', ['-Xr9D', out, '.', '-x', 'mimetype'], { cwd: tmp });
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out);
