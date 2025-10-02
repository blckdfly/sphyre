import React from 'react';
import * as ReactBits from '@appletosolutions/reactbits';

function TestComponents() {
  console.log('Available ReactBits components:', Object.keys(ReactBits));
  
  return (
    <div>
      <h1>ReactBits Components Test</h1>
    </div>
  );
}

export default TestComponents;