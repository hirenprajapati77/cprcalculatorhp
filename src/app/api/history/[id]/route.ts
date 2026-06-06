import { NextRequest, NextResponse } from 'next/server';
import { HistoryService } from '@/services/history.service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Calculation ID is required' },
        { status: 400 }
      );
    }

    const success = await HistoryService.deleteEntry(id);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Calculation entry not found or could not be deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Error deleting history entry:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while deleting' },
      { status: 500 }
    );
  }
}
