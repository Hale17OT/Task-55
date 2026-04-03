import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import type { DashboardPayload } from '../../core/domain/analytics';

export function generateCsv(payload: DashboardPayload): string {
  const rows: string[][] = [];

  // Popularity section
  rows.push(['--- Event/Job Popularity ---']);
  rows.push(['Event Type', 'Count']);
  payload.popularity.labels.forEach((label, i) => {
    rows.push([label, String(payload.popularity.data[i])]);
  });
  rows.push([]);

  // Conversion funnel
  rows.push(['--- Conversion Funnel ---']);
  rows.push(['Stage', 'Count']);
  payload.conversionFunnel.stages.forEach((stage, i) => {
    rows.push([stage, String(payload.conversionFunnel.counts[i])]);
  });
  rows.push([]);

  // Attendance rate
  rows.push(['--- Attendance Rate ---']);
  rows.push(['Category', 'Rate']);
  payload.attendanceRate.labels.forEach((label, i) => {
    rows.push([label, String(payload.attendanceRate.rates[i])]);
  });
  rows.push([]);

  // Cancellation rate
  rows.push(['--- Cancellation Rate ---']);
  rows.push(['Category', 'Rate']);
  payload.cancellationRate.labels.forEach((label, i) => {
    rows.push([label, String(payload.cancellationRate.rates[i])]);
  });
  rows.push([]);

  // Channel distribution
  rows.push(['--- Channel Distribution ---']);
  rows.push(['Channel', 'Count']);
  payload.channelDistribution.labels.forEach((label, i) => {
    rows.push([label, String(payload.channelDistribution.counts[i])]);
  });
  rows.push([]);

  // Tag distribution
  rows.push(['--- Tag Distribution ---']);
  rows.push(['Tag', 'Count']);
  payload.tagDistribution.labels.forEach((label, i) => {
    rows.push([label, String(payload.tagDistribution.counts[i])]);
  });

  return stringify(rows);
}

export async function generateExcel(payload: DashboardPayload): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Popularity worksheet
  const popSheet = workbook.addWorksheet('Popularity');
  popSheet.addRow(['Event Type', 'Count']);
  payload.popularity.labels.forEach((label, i) => {
    popSheet.addRow([label, payload.popularity.data[i]]);
  });
  styleHeader(popSheet);

  // Conversion worksheet
  const convSheet = workbook.addWorksheet('Conversion Funnel');
  convSheet.addRow(['Stage', 'Count']);
  payload.conversionFunnel.stages.forEach((stage, i) => {
    convSheet.addRow([stage, payload.conversionFunnel.counts[i]]);
  });
  styleHeader(convSheet);

  // Attendance worksheet
  const attSheet = workbook.addWorksheet('Attendance Rate');
  attSheet.addRow(['Category', 'Rate']);
  payload.attendanceRate.labels.forEach((label, i) => {
    attSheet.addRow([label, payload.attendanceRate.rates[i]]);
  });
  styleHeader(attSheet);

  // Cancellation worksheet
  const canSheet = workbook.addWorksheet('Cancellation Rate');
  canSheet.addRow(['Category', 'Rate']);
  payload.cancellationRate.labels.forEach((label, i) => {
    canSheet.addRow([label, payload.cancellationRate.rates[i]]);
  });
  styleHeader(canSheet);

  // Channel worksheet
  const chanSheet = workbook.addWorksheet('Channel Distribution');
  chanSheet.addRow(['Channel', 'Count']);
  payload.channelDistribution.labels.forEach((label, i) => {
    chanSheet.addRow([label, payload.channelDistribution.counts[i]]);
  });
  styleHeader(chanSheet);

  // Tag worksheet
  const tagSheet = workbook.addWorksheet('Tag Distribution');
  tagSheet.addRow(['Tag', 'Count']);
  payload.tagDistribution.labels.forEach((label, i) => {
    tagSheet.addRow([label, payload.tagDistribution.counts[i]]);
  });
  styleHeader(tagSheet);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };
  sheet.columns.forEach(col => { col.width = 20; });
}
