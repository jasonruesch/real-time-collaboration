import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import IndexPage from './page';

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/board/:roomId" element={<div>Board</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('landing page', () => {
  it('shows the create action and a disabled join until an id is typed', async () => {
    renderLanding();
    expect(
      screen.getByRole('button', { name: /create a new board/i }),
    ).toBeInTheDocument();

    const join = screen.getByRole('button', { name: /^join$/i });
    expect(join).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/board id to join/i), 'demo');
    expect(join).toBeEnabled();
  });

  it('navigates to a fresh board when creating', async () => {
    renderLanding();
    await userEvent.click(
      screen.getByRole('button', { name: /create a new board/i }),
    );
    expect(screen.getByText('Board')).toBeInTheDocument();
  });
});
