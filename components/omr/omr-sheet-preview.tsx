"use client";
import { useEffect, useState } from "react";
import {
  resolveGeometry,
  idBubbles,
  answerBubbles,
  printTexts,
  modernPrint,
  fillExamples,
  type SheetLayout,
} from "@/lib/omr/generate-template";
import { createSetIdentity, qrDataUrl } from "@/lib/omr/qr";
import {
  gridDecorations,
  gridExamples,
  gridExampleY,
  schoolGridPrint,
} from "@/lib/omr/school-grid";
import { choices, thaiChoices } from "@/types/exam";
import type { Observation } from "@/types/result";
import type { PrintStudent } from "@/types/print";

export function SheetContent({
  layout,
  qr,
  guides = false,
  marked,
  highlight,
  student,
}: {
  layout: SheetLayout;
  qr: string;
  guides?: boolean;
  marked?: Observation[];
  highlight?: number;
  student?: PrintStudent;
}) {
  const g = resolveGeometry(layout);
  const grid = schoolGridPrint(layout)
    ? gridDecorations(layout, g, student)
    : null;
  return (
    <g
      className="sheet-ink"
      fontFamily="Noto Sans Thai, sans-serif"
      fill="#111827"
    >
      <rect
        x="0"
        y="0"
        width={g.sheetWidth}
        height={g.sheetHeight}
        fill="white"
      />
      {guides && (
        <rect
          x="10"
          y="10"
          width={g.sheetWidth - 20}
          height={g.sheetHeight - 20}
          fill="none"
          stroke="#8da3c6"
          strokeDasharray="2 1"
          strokeWidth="0.25"
        />
      )}
      {g.markers.map((m, i) => (
        <rect key={i} x={m.x} y={m.y} width="3" height="3" fill="#121212" />
      ))}
      {layout.logo && (
        <image
          data-sheet-logo="true"
          href={layout.logo}
          {...g.logo}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <rect {...g.score} fill="none" stroke="#333" strokeWidth="0.2" />
      {qr && (
        <image
          data-sheet-qr="true"
          href={qr}
          x={g.qr.x}
          y={g.qr.y}
          width={g.qr.width}
          height={g.qr.width}
        />
      )}
      {grid?.lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#222"
          strokeDasharray={line.dashed ? "0.24 0.48" : undefined}
          strokeWidth={line.dashed ? 0.16 : 0.2}
        />
      ))}
      {[...printTexts(layout, g, student), ...(grid?.texts ?? [])].map(
        (t, i) => (
          <text
            key={i}
            x={t.x}
            y={t.y}
            fontSize={t.size}
            fontWeight={t.weight === "bold" ? 700 : 400}
            textAnchor={
              t.align === "center"
                ? "middle"
                : t.align === "right"
                  ? "end"
                  : "start"
            }
          >
            {t.value}
          </text>
        ),
      )}
      {grid &&
        gridExamples.map(({ kind, label, x, labelX }) => (
          <g key={kind} data-fill-example={kind}>
            <circle
              cx={x}
              cy={gridExampleY}
              r="1.8"
              stroke="#222"
              strokeWidth="0.2"
              fill={
                kind === "correct" || kind === "multiple" ? "black" : "none"
              }
            />
            {kind === "partial" && (
              <circle cx={x - 0.45} cy={gridExampleY} r="0.87" fill="black" />
            )}
            {kind === "multiple" && (
              <circle cx={x + 4.5} cy={gridExampleY} r="1.8" fill="black" />
            )}
            {kind === "outside" && (
              <ellipse
                cx={x + 0.4}
                cy={gridExampleY - 0.1}
                rx="2.3"
                ry="1.2"
                fill="black"
              />
            )}
            <text x={labelX} y={gridExampleY + 0.85} fontSize="2.4">
              {label}
            </text>
          </g>
        ))}
      {!grid &&
        modernPrint(layout) &&
        fillExamples(g).map((example) => (
          <g key={example.kind} data-fill-example={example.kind}>
            <circle
              cx={example.x}
              cy={example.y}
              r={example.kind === "outside" ? 2.5 : 1.8}
              fill={example.kind === "partial" ? "none" : "black"}
              stroke="black"
              strokeWidth="0.2"
            />
            {example.kind === "partial" && (
              <circle
                cx={example.x - 0.4}
                cy={example.y}
                r="0.8"
                fill="black"
              />
            )}
            {example.kind === "outside" && (
              <circle
                cx={example.x}
                cy={example.y}
                r="1.8"
                fill="none"
                stroke="white"
                strokeWidth="0.2"
              />
            )}
            {example.kind === "multiple" && (
              <circle
                cx={example.x + 5.5}
                cy={example.y}
                r="1.8"
                fill="black"
              />
            )}
            <text x={example.labelX} y={example.y + 0.9} fontSize="2.5">
              {example.kind === "correct" ? "ถูก" : "ผิด"} · {example.label}
            </text>
          </g>
        ))}
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i}>
          {!grid && (
            <rect
              x={g.idStart.x + i * g.idStepX - 2}
              y="75"
              width="4"
              height="4"
              fill="none"
              stroke="#222"
              strokeWidth="0.2"
            />
          )}
          {student && (
            <text
              x={g.idStart.x + i * g.idStepX}
              y={grid ? 40.9 : 78}
              data-id-printed-digit={i}
              textAnchor="middle"
              fontSize={grid ? 3 : 2.6}
              fontWeight={grid ? 700 : undefined}
            >
              {student.student_code[i]}
            </text>
          )}
        </g>
      ))}
      {idBubbles(g).map((b) => {
        const fill = student?.student_code[b.digit] === String(b.value);
        return (
          <g key={`${b.digit}-${b.value}`}>
            <circle
              cx={b.x}
              cy={b.y}
              r={g.bubbleRadius}
              data-id-digit={b.digit}
              data-id-value={b.value}
              fill={fill ? "#000" : "none"}
              stroke="#333"
              strokeWidth="0.2"
            />
            {!fill && (
              <text
                x={b.x}
                y={b.y + 0.85}
                textAnchor="middle"
                fontSize={grid ? 1.85 : 2.2}
                fill="#333"
              >
                {b.value}
              </text>
            )}
          </g>
        );
      })}
      {answerBubbles(layout, g).map((b) => {
        const raw = marked?.find((a) => a.question === b.question);
        const fill = raw?.choice === choices[b.option];
        return (
          <g
            key={`${b.question}-${b.option}`}
            data-question={b.question}
            data-option={b.option}
          >
            {highlight === b.question && b.option === 0 && (
              <rect
                x={b.x - 8}
                y={b.y - (grid ? 2.25 : 3)}
                width={(layout.choiceCount - 1) * g.answerStepX + 12}
                height={grid ? 4.5 : 6}
                fill="#fef3c7"
                stroke="#d89115"
                strokeWidth="0.25"
              />
            )}
            <circle
              cx={b.x}
              cy={b.y}
              r={g.bubbleRadius}
              fill={
                fill ? (raw?.state === "ambiguous" ? "#999" : "#333") : "none"
              }
              stroke="#333"
              strokeWidth="0.2"
            />
            <text
              x={b.x}
              y={b.y + 0.85}
              textAnchor="middle"
              fontSize={grid ? 1.9 : 2.2}
              fill={fill ? "white" : "#333"}
            >
              {thaiChoices[b.option]}
            </text>
            {b.option === 0 && (
              <text
                x={
                  grid
                    ? grid.questionLeft +
                      Math.floor((b.question - 1) / g.rows) *
                        g.answerColumnWidth
                    : b.x - 7
                }
                y={b.y + (grid ? 0.85 : 1)}
                textAnchor={grid ? "middle" : undefined}
                fontWeight={
                  grid && (b.question - 1) % g.rows === 0 ? 700 : undefined
                }
                fontSize={grid ? 2.4 : 2.7}
              >
                {b.question}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
export function SheetPreview({
  layout,
  guides = false,
  single = true,
  marked,
  highlight,
  copies = 2,
  student,
  secondStudent,
}: {
  layout: SheetLayout;
  guides?: boolean;
  single?: boolean;
  marked?: Observation[];
  highlight?: number;
  copies?: number;
  student?: PrintStudent;
  secondStudent?: PrintStudent;
}) {
  const g = resolveGeometry(layout);
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    createSetIdentity(layout)
      .then((identity) =>
        qrDataUrl(identity.token, modernPrint(layout) ? 512 : 256),
      )
      .then(
        (value) => active && setQr(value),
        () => active && setQr(""),
      );
    return () => {
      active = false;
    };
  }, [layout]);
  return (
    <svg
      viewBox={`0 0 ${single ? g.sheetWidth : g.paperWidth} ${g.sheetHeight}`}
      className="sheet-preview"
      role="img"
      aria-label={
        single ? "กระดาษคำตอบตัวอย่างหนึ่งใบ" : "ตัวอย่างการจัดวางบน A4"
      }
    >
      <title>{layout.title}</title>
      <SheetContent
        layout={layout}
        qr={qr}
        guides={guides}
        marked={marked}
        highlight={highlight}
        student={student}
      />
      {!single && g.sheetsPerPage === 2 && (
        <>
          {copies > 1 && (
            <g transform="translate(148.5 0)">
              <SheetContent
                layout={layout}
                qr={qr}
                guides={guides}
                student={secondStudent}
              />
            </g>
          )}
          <path
            d="M148.5 0V210"
            stroke="#a1a7b0"
            strokeWidth="0.3"
            strokeDasharray="2 1"
          />
        </>
      )}
    </svg>
  );
}
