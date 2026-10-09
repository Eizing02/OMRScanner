"use client";
import { useEffect, useState } from "react";
import {
  resolveGeometry,
  idBubbles,
  answerBubbles,
  printTexts,
  type SheetLayout,
} from "@/lib/omr/generate-template";
import { createSetIdentity, qrDataUrl } from "@/lib/omr/qr";
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
          height="190"
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
      {printTexts(layout, g, student).map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          textAnchor={t.align === "center" ? "middle" : "start"}
        >
          {t.value}
        </text>
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i}>
          <rect
            x={g.idStart.x + i * g.idStepX - 2}
            y="75"
            width="4"
            height="4"
            fill="none"
            stroke="#222"
            strokeWidth="0.2"
          />
          {student && (
            <text
              x={g.idStart.x + i * g.idStepX}
              y="78"
              textAnchor="middle"
              fontSize="2.6"
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
                fontSize="2.2"
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
                y={b.y - 3}
                width={(layout.choiceCount - 1) * g.answerStepX + 12}
                height="6"
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
              fontSize="2.2"
              fill={fill ? "white" : "#333"}
            >
              {thaiChoices[b.option]}
            </text>
            {b.option === 0 && (
              <text x={b.x - 7} y={b.y + 1} fontSize="2.7">
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
      .then((identity) => qrDataUrl(identity.token))
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
      viewBox={`0 0 ${single ? g.sheetWidth : 297} 210`}
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
