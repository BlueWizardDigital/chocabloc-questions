// Shared contract fixture (plan § Contract): answer is 'B'.
export const FIGURE_EXAMPLE = {
  operation: 'geometry_symmetry_line_pick',
  panels: [
    {
      polygons: [{ points: [[-7, -4], [7, -4], [7, 4], [-7, 4]] }],
      lines: [
        { from: [-8.6, -4.9], to: [8.6, 4.9], label: 'A' },
        { from: [0, -6.5], to: [0, 6.5], label: 'B' },
        { from: [8.6, -4.9], to: [-8.6, 4.9], label: 'C' },
        { from: [3.5, -6.5], to: [3.5, 6.5], label: 'D' },
      ],
    },
  ],
};
