'use client';

import { useEffect, useState } from 'react';
import { collectProjectFile } from '@/lib/project-file/collect';
import { isEmptyProjectFile, serializeProjectFile } from '@/lib/project-file/sanitize';

/**
 * Hidden `_project_file` input for any lead form: the visitor's project file
 * (lib/project-file/collect.ts), read after mount. The server sanitizes,
 * merges and scores it (lib/revenue/lead-pipeline.ts). Renders nothing when
 * the visitor has no file yet.
 */
export default function ProjectFileField({ name = '_project_file' }: { name?: string }) {
  const [value, setValue] = useState('');
  useEffect(() => {
    const file = collectProjectFile();
    if (!isEmptyProjectFile(file)) setValue(serializeProjectFile(file));
  }, []);
  return value ? <input type="hidden" name={name} value={value} /> : null;
}
