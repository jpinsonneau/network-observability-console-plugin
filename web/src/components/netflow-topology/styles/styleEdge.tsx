import { DefaultEdge, Edge, observer, ScaleDetailsLevel, WithSelectionProps } from '@patternfly/react-topology';
import useDetailsLevel from '@patternfly/react-topology/dist/esm/hooks/useDetailsLevel';
import * as React from 'react';
import { usePrevious } from '../../../utils/previous-hook';
import { HOVER_EVENT } from '../netflow-topology';

type StyleEdgeProps = {
  element: Edge;
} & WithSelectionProps;

const StyleEdge: React.FC<StyleEdgeProps> = ({ element, ...rest }) => {
  const data = element.getData();
  const [isHovered, setHovered] = React.useState<boolean>(false);
  const previousHovered = usePrevious(isHovered);
  const detailsLevel = useDetailsLevel();

  React.useEffect(() => {
    if (previousHovered !== isHovered) {
      element.getController().fireEvent(HOVER_EVENT, {
        ...data,
        id: element.getId(),
        isHovered
      });
    }
  }, [data, element, isHovered, previousHovered]);

  const passedData = React.useMemo(() => {
    const newData = { ...data };
    if (detailsLevel !== ScaleDetailsLevel.high) {
      newData.tag = undefined;
    }
    Object.keys(newData).forEach(key => {
      if (newData[key] === undefined) {
        delete newData[key];
      }
    });
    return newData;
  }, [data, detailsLevel]);

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`topology ${data.shadowed ? 'shadowed' : ''} ${data.hovered ? 'edge-hovered' : ''}`}>
      <DefaultEdge element={element} {...rest} {...passedData} />
    </g>
  );
};

export default observer(StyleEdge);
