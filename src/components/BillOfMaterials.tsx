import type { Issue, Fix } from '../types';

interface BillOfMaterialsProps {
  issues: Issue[];
  fixes: Fix[];
}

const severityColor: Record<Issue['severity'], string> = {
  high: '#d64545',
  medium: '#e0a030',
  low: '#5a8f5a',
};

export function BillOfMaterials({ issues, fixes }: BillOfMaterialsProps) {
  const rows = issues.flatMap((issue) =>
    fixes
      .filter((fix) => fix.issueId === issue.id)
      .map((fix) => ({ issue, fix }))
  );

  const total = rows.reduce(
    (sum, { fix }) => sum + fix.product.unitCost * fix.product.estimatedQuantity,
    0
  );

  return (
    <div className="bom">
      <h2>Bill of Materials</h2>
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Fix</th>
            <th>Product</th>
            <th>Cost</th>
            <th>Standard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ issue, fix }) => (
            <tr key={fix.issueId + fix.type}>
              <td>
                <span className="severity-dot" style={{ background: severityColor[issue.severity] }} />
                {issue.description}
              </td>
              <td>{fix.type}</td>
              <td>{fix.product.name}</td>
              <td>
                ${fix.product.unitCost * fix.product.estimatedQuantity} ({fix.product.estimatedQuantity}{' '}
                {fix.product.unit})
              </td>
              <td>{issue.standardReference}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total estimated cost</td>
            <td>${total}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
